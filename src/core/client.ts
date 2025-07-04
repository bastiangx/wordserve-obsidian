import { Plugin } from "obsidian";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import { encode, decode, Decoder } from "@msgpack/msgpack";
import {
  CompletionRequest,
  CompletionResponse,
  ConfigResponse,
  DictionaryRequest,
  DictionaryResponse,
  Suggestion,
  BackendResponse,
  TyperPluginSettings,
  CompletionError,
} from "../types";
import { logger } from "../utils/logger";
import { AutoRespawnManager } from "../utils/autores";

interface TyperPlugin extends Plugin {
  settings: TyperPluginSettings;
}

const generateId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  const counter = (generateId as any).counter = ((generateId as any).counter || 0) + 1;
  const processId = process.pid.toString(36);
  return `${timestamp}-${random}-${counter}-${processId}`;
};

/** Handles communication with the backend process via MessagePack. */
export class TyperClient {
  private process: child_process.ChildProcess | null = null;
  private plugin: TyperPlugin;
  private isReady: boolean = false;
  private requestCallbacks = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; timer: NodeJS.Timeout }>();
  private autoRespawnManager: AutoRespawnManager;
  private messageBuffer: Buffer = Buffer.alloc(0);
  private usedRequestIds = new Set<string>();
  private requestIdCleanupCounter = 0;
  private readonly MAX_BUFFER_SIZE = 1024 * 1024; // 1MB max buffer size

  constructor(plugin: TyperPlugin) {
    this.plugin = plugin;
    this.autoRespawnManager = new AutoRespawnManager(
      plugin.settings.autorespawn,
      () => this.restart()
    );
  }

  private sendRequest<T extends BackendResponse>(request: CompletionRequest | DictionaryRequest, timeout = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error("Typer process is not running."));
      }

      let id = generateId();
      let attempts = 0;
      const maxAttempts = 50; // Increased from 10 to reduce collision risk
      
      // Ensure unique ID with better collision handling
      while (this.usedRequestIds.has(id) && attempts < maxAttempts) {
        id = generateId();
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        // Fallback: force cleanup old IDs and try once more
        this.cleanupOldRequestIds();
        id = generateId();
        if (this.usedRequestIds.has(id)) {
          return reject(new Error("Unable to generate unique request ID after cleanup"));
        }
      }
      
      this.usedRequestIds.add(id);
      request.id = id;

      // Use shorter timeout for suggestion requests to improve responsiveness
      const actualTimeout = request.hasOwnProperty('p') ? Math.min(timeout, 1500) : timeout;
      
      const timer = setTimeout(() => {
        this.cleanupRequest(id);
        reject(new Error(`Request timed out after ${actualTimeout}ms`));
      }, actualTimeout);

      this.requestCallbacks.set(id, { resolve, reject, timer });

      try {
        const encoded = encode(request);
        this.process.stdin.write(encoded, (err) => {
          if (err) {
            this.cleanupRequest(id);
            reject(err);
          }
        });
      } catch (error) {
        this.cleanupRequest(id);
        reject(error);
      }
    });
  }

  private cleanupRequest(id: string): void {
    const callback = this.requestCallbacks.get(id);
    if (callback) {
      clearTimeout(callback.timer);
      this.requestCallbacks.delete(id);
    }
    this.usedRequestIds.delete(id);
    
    // Periodic cleanup of request ID tracking to prevent memory leaks
    this.requestIdCleanupCounter++;
    if (this.requestIdCleanupCounter >= 100) {
      this.cleanupOldRequestIds();
      this.requestIdCleanupCounter = 0;
    }
  }

  private cleanupOldRequestIds(): void {
    // If we have too many tracked IDs, clear them to prevent memory leaks
    if (this.usedRequestIds.size > 1000) {
      logger.debug(`Cleaning up ${this.usedRequestIds.size} tracked request IDs`);
      this.usedRequestIds.clear();
    }
  }

  /** Fetches word suggestions from the backend. */
  async getSuggestions(query: string): Promise<Suggestion[]> {
    if (!this.isReady) {
      logger.warn("TyperClient not ready, cannot fetch suggestions.");
      return [];
    }

    try {
      const request: CompletionRequest = {
        p: query,
        l: this.plugin.settings.maxSuggestions,
      };
      const response = await this.sendRequest<CompletionResponse>(request);
      
      // Non-blocking auto-respawn tracking with reduced frequency
      if (Math.random() < 0.1) { // Only track 10% of requests to reduce overhead
        this.autoRespawnManager.onSuggestionRequest().catch(err => {
          logger.error("Auto-respawn tracking error:", err);
        });
      }
      
      return response.s.map(s => ({ word: s.w, rank: s.r }));
    } catch (error) {
      logger.error("Error fetching suggestions:", error);
      return [];
    }
  }

  /** Initializes the backend process. */
  async initialize(): Promise<boolean> {
    if (this.isReady) {
      return true;
    }

    try {
      await this.startProcess();
      this.isReady = true;
      logger.debug("TyperClient initialized successfully.");
      return true;
    } catch (error) {
      logger.error("Failed to initialize TyperClient:", error);
      this.cleanup();
      return false;
    }
  }

  private async startProcess(): Promise<void> {
    const binaryName = process.platform === "win32" ? "typer.exe" : "typer";
    const adapter = this.plugin.app.vault.adapter;
    const vaultPath = "getBasePath" in adapter ? (adapter as { getBasePath(): string }).getBasePath() : "";
    const pluginDir = this.plugin.manifest.dir || ".";
    const binaryDir = path.join(vaultPath, pluginDir, "data");
    const binaryPath = path.join(vaultPath, pluginDir, binaryName);

    try {
      await fs.promises.access(binaryPath, fs.constants.F_OK);
    } catch {
      throw new Error(`Typer binary not found at ${binaryPath}`);
    }

    const args = [`--data=${binaryDir}`];
    if (this.plugin.settings.debugMode) {
      args.push('-d');
    }

    this.process = child_process.spawn(binaryPath, args, { stdio: ["pipe", "pipe", "pipe"] });

    this.process.on("exit", (code) => {
      logger.debug(`typer process exited with code ${code}`);
      this.cleanup();
    });

    this.process.on("error", (error) => {
      logger.error("Typer process error:", error);
      this.cleanup();
    });

    if (!this.process.stdout || !this.process.stderr) {
      throw new Error("Failed to get process stdio");
    }

    this.process.stdout.on("data", (chunk) => {
      this.handleIncomingData(chunk);
    });

    this.process.stderr.on("data", (data) => {
      logger.parseCoreLog(data.toString());
    });

    return this.waitForProcessReady();
  }

  private async waitForProcessReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Process initialization timeout after 5 seconds"));
      }, 5000);

      // Wait for first data from stdout indicating process is ready
      const onFirstData = () => {
        clearTimeout(timeout);
        this.process?.stdout?.off('data', onFirstData);
        // Give the process a moment to stabilize
        setTimeout(resolve, 100);
      };

      this.process?.stdout?.once('data', onFirstData);
      
      // Fallback: if no data received, use minimal delay
      setTimeout(() => {
        if (!this.isReady) {
          clearTimeout(timeout);
          this.process?.stdout?.off('data', onFirstData);
          resolve();
        }
      }, 300);
    });
  }

  private handleIncomingData(chunk: Buffer): void {
    // Prevent buffer overflow attacks
    if (this.messageBuffer.length + chunk.length > this.MAX_BUFFER_SIZE) {
      logger.error("Message buffer size exceeded, resetting buffer");
      this.messageBuffer = Buffer.alloc(0);
      return;
    }

    this.messageBuffer = Buffer.concat([this.messageBuffer, chunk]);
    
    while (this.messageBuffer.length > 0) {
      let decoded: any;
      let consumedBytes: number;
      
      try {
        // Use a custom decoder to track position
        const decoder = new Decoder(this.messageBuffer);
        decoded = decoder.decode(this.messageBuffer);
        
        // Try to determine consumed bytes by encoding and comparing
        const encoded = encode(decoded);
        consumedBytes = encoded.length;
        
        // Validate the response
        const response = this.validateResponse(decoded);
        if (response) {
          this.processResponse(response);
        }
        
        // Update buffer to remove consumed bytes
        if (consumedBytes > 0 && consumedBytes <= this.messageBuffer.length) {
          this.messageBuffer = this.messageBuffer.slice(consumedBytes);
        } else {
          // Fallback: if we can't determine consumed bytes, break
          break;
        }
      } catch (error) {
        // If we can't decode, we might not have a complete message yet
        if (error instanceof RangeError || 
            error.message.includes('Insufficient data') || 
            error.message.includes('Unexpected end') ||
            error.message.includes('Unexpected token')) {
          break;
        }
        logger.error("Failed to decode msgpack stream:", error);
        // Reset buffer on parsing error to prevent infinite loop
        this.messageBuffer = Buffer.alloc(0);
        break;
      }
    }
  }

  private validateResponse(decoded: any): BackendResponse | null {
    if (!decoded || typeof decoded !== 'object') {
      logger.warn("Invalid response format: not an object");
      return null;
    }

    if (!decoded.id || typeof decoded.id !== 'string') {
      logger.warn("Invalid response format: missing or invalid id");
      return null;
    }

    // Check for completion response
    if ('s' in decoded && Array.isArray(decoded.s)) {
      return decoded as CompletionResponse;
    }

    // Check for completion error
    if ('e' in decoded && typeof decoded.e === 'string') {
      return decoded as CompletionError;
    }

    // Check for config response
    if ('status' in decoded && typeof decoded.status === 'string') {
      return decoded as ConfigResponse | DictionaryResponse;
    }

    logger.warn("Unknown response format", decoded);
    return null;
  }

  private processResponse(response: BackendResponse): void {
    const callback = this.requestCallbacks.get(response.id);
    if (callback) {
      this.cleanupRequest(response.id);
      
      // Handle different response types
      if ('e' in response && response.e) {
        callback.reject(new Error(response.e));
      } else if ('error' in response && response.error) {
        callback.reject(new Error(response.error));
      } else {
        callback.resolve(response);
      }
    } else {
      logger.warn(`No callback found for response ID: ${response.id}`);
    }
  }

  /** Configures dictionary size by setting the number of dictionary chunks to load. */
  async setDictionarySize(chunkCount: number): Promise<ConfigResponse> {
    const request: DictionaryRequest = {
      action: "set_size",
      chunk_count: Math.max(1, Math.floor(chunkCount)),
    };
    return this.sendRequest<ConfigResponse>(request, 5000);
  }

  /** Gets current dictionary information including loaded chunks and statistics. */
  async getDictionaryInfo(): Promise<DictionaryResponse> {
    const request: DictionaryRequest = { action: "get_info" };
    return this.sendRequest<DictionaryResponse>(request);
  }

  /** Gets available dictionary size options from the backend. */
  async getDictionaryOptions(): Promise<DictionaryResponse> {
    const request: DictionaryRequest = { action: "get_options" };
    return this.sendRequest<DictionaryResponse>(request);
  }

  /** Restarts the backend process to recover from errors or refresh state. */
  async restart(): Promise<boolean> {
    logger.debug("Restarting typer client");
    this.cleanup();
    await new Promise(resolve => setTimeout(resolve, 100));
    const success = await this.initialize();
    if (success) {
      this.autoRespawnManager.reset();
    }
    return success;
  }

  /** Cleans up process and resources when the client is shutting down. */
  cleanup() {
    this.isReady = false;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    
    // Clean up all pending requests
    const pendingCallbacks = Array.from(this.requestCallbacks.entries());
    this.requestCallbacks.clear();
    this.usedRequestIds.clear();
    
    for (const [id, callback] of pendingCallbacks) {
      clearTimeout(callback.timer);
      callback.reject(new Error("TyperClient is shutting down"));
    }
    
    // Clear message buffer
    this.messageBuffer = Buffer.alloc(0);
  }

  async updateConfigFile(updates: Partial<TyperPluginSettings>): Promise<boolean> {
    return true;
  }

  /** Updates auto-respawn configuration settings. */
  updateAutoRespawnConfig(config: { enabled: boolean; requestThreshold: number; timeThresholdMinutes: number }): void {
    this.autoRespawnManager.updateConfig(config);
  }

  /** Returns current auto-respawn statistics for monitoring. */
  getAutoRespawnStats(): { requestCount: number; minutesSinceLastRespawn: number } {
    return this.autoRespawnManager.getStats();
  }

  /** Gets health statistics for monitoring client performance. */
  getHealthStats(): { 
    pendingRequests: number; 
    bufferSize: number; 
    trackedRequestIds: number;
    isProcessRunning: boolean;
  } {
    return {
      pendingRequests: this.requestCallbacks.size,
      bufferSize: this.messageBuffer.length,
      trackedRequestIds: this.usedRequestIds.size,
      isProcessRunning: this.process !== null && !this.process.killed
    };
  }

  /** Forces cleanup of resources for maintenance operations. */
  forceCleanup(): void {
    this.cleanupOldRequestIds();
    
    // Clear message buffer if it's getting too large
    if (this.messageBuffer.length > this.MAX_BUFFER_SIZE / 2) {
      logger.debug("Force clearing message buffer due to size");
      this.messageBuffer = Buffer.alloc(0);
    }
  }
}
