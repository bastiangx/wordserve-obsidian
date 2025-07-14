import { Plugin } from "obsidian";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import { encode, decode, decodeMulti } from "@msgpack/msgpack";
import {
  CompletionRequest,
  CompletionResponse,
  ConfigResponse,
  DictionaryRequest,
  DictionaryResponse,
  Suggestion,
  BackendResponse,
  WordServePluginSettings,
  CompletionError,
} from "../types";
import { logger } from "../utils/logger";
import { AutoRespawnManager } from "../utils/autores";
import { WordServeDownloader } from "../downloader";

interface WordServePlugin extends Plugin {
  settings: WordServePluginSettings;
}

const generateId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  const counter = (generateId as any).counter = ((generateId as any).counter || 0) + 1;
  return `${timestamp}-${random}-${counter}`;
};

/** Handles communication with the backend process via MessagePack. */
export class WordServeClient {
  private process: child_process.ChildProcess | null = null;
  private plugin: WordServePlugin;
  private isReady: boolean = false;
  private requestCallbacks = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; timer: NodeJS.Timeout }>();
  private autoRespawnManager: AutoRespawnManager;
  private usedRequestIds = new Set<string>();
  private isShuttingDown: boolean = false;

  constructor(plugin: WordServePlugin) {
    this.plugin = plugin;
    this.autoRespawnManager = new AutoRespawnManager(
      plugin.settings.autorespawn,
      () => this.restart()
    );
  }

  private sendRequest<T extends BackendResponse>(request: CompletionRequest | DictionaryRequest, timeout = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error("WordServe process is not running."));
      }

      let id = generateId();
      let attempts = 0;
      const maxAttempts = 10;

      // Ensure unique ID
      while (this.usedRequestIds.has(id) && attempts < maxAttempts) {
        id = generateId();
        attempts++;
      }

      if (attempts >= maxAttempts) {
        return reject(new Error("Unable to generate unique request ID"));
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
  }

  /** Fetches word suggestions from the backend. */
  async getSuggestions(query: string): Promise<Suggestion[]> {
    if (!this.isReady) {
      logger.warn("WordServeClient not ready, attempting to reinitialize...");
      const success = await this.initialize();
      if (!success) {
        return [];
      }
    }

    // Check if process is still alive
    if (!this.process || this.process.killed) {
      logger.warn("Process is dead, attempting restart...");
      const success = await this.restart();
      if (!success) {
        return [];
      }
    }

    try {
      const maxSuggestions = Math.max(1, this.plugin.settings.maxSuggestions || 20);
      const request: CompletionRequest = {
        p: query,
        l: maxSuggestions,
      };

      if (maxSuggestions <= 0) {
        logger.warn(`Invalid maxSuggestions value: ${this.plugin.settings.maxSuggestions}, using default: 20`);
      }

      const response = await this.sendRequest<CompletionResponse>(request);

      // Non-blocking auto-respawn tracking
      this.autoRespawnManager.onSuggestionRequest().catch(err => {
        logger.error("Auto-respawn tracking error:", err);
      });

      return response.s.map(s => ({ word: s.w, rank: s.r }));
    } catch (error) {
      logger.error("Error fetching suggestions:", error);

      // If we get a timeout, the process might be dead - try to restart
      if (error.message.includes('timeout')) {
        logger.warn("Request timeout, process might be unresponsive. Attempting restart...");
        this.restart().catch(restartErr => {
          logger.error("Failed to restart after timeout:", restartErr);
        });
      }

      return [];
    }
  }

  /** Initializes the backend process. */
  async initialize(): Promise<boolean> {
    if (this.isReady) {
      return true;
    }

    try {
      // First, ensure WordServe binary is downloaded and available
      const adapter = this.plugin.app.vault.adapter;
      const vaultPath = "getBasePath" in adapter ? (adapter as { getBasePath(): string }).getBasePath() : "";
      const pluginDir = this.plugin.manifest.dir || ".";
      const pluginPath = path.join(vaultPath, pluginDir);
      
      const downloader = new WordServeDownloader(pluginPath);
      const downloadResult = await downloader.downloadAndInstall();
      
      if (!downloadResult.success) {
        throw new Error(downloadResult.error || "Failed to download WordServe binary");
      }
      
      await this.startProcess();
      this.isReady = true;
      logger.debug("WordServeClient initialized successfully.");
      return true;
    } catch (error) {
      logger.error("Failed to initialize WordServeClient:", error);
      this.cleanup();
      return false;
    }
  }

  private async startProcess(): Promise<void> {
    const binaryName = process.platform === "win32" ? "wordserve.exe" : "wordserve";
    const adapter = this.plugin.app.vault.adapter;
    const vaultPath = "getBasePath" in adapter ? (adapter as { getBasePath(): string }).getBasePath() : "";
    const pluginDir = this.plugin.manifest.dir || ".";
    const binaryDir = path.join(vaultPath, pluginDir, "data");
    const binaryPath = path.join(vaultPath, pluginDir, binaryName);

    try {
      await fs.promises.access(binaryPath, fs.constants.F_OK);
    } catch {
      throw new Error(`WordServe binary not found at ${binaryPath}`);
    }

    const args = [`--data=${binaryDir}`];
    if (this.plugin.settings.debugMode) {
      args.push('-v');
    }

    this.process = child_process.spawn(binaryPath, args, { stdio: ["pipe", "pipe", "pipe"] });

    this.process.on("exit", (code) => {
      logger.debug(`wordserve process exited with code ${code}`);
      this.isReady = false;

      // Auto-restart if process dies unexpectedly (not during cleanup or shutdown)
      if (this.process !== null && !this.isShuttingDown) {
        logger.warn("WordServe process died unexpectedly, attempting restart...");
        setTimeout(() => {
          this.restart().catch(err => {
            logger.error("Failed to auto-restart wordserve process:", err);
          });
        }, 1000);
      }
    });

    this.process.on("error", (error) => {
      logger.error("WordServe process error:", error);
      this.isReady = false;
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

    return new Promise((resolve) => setTimeout(resolve, 200));
  }

  private handleIncomingData(chunk: Buffer): void {
    try {
      for (const decoded of decodeMulti(chunk)) {
        this.processResponse(decoded as BackendResponse);
      }
    } catch (error) {
      logger.error("Failed to decode msgpack stream:", error);
    }
  }

  private processResponse(response: BackendResponse): void {
    if (!response.id) {
      logger.warn("Received response without ID", response);
      return;
    }

    const callback = this.requestCallbacks.get(response.id);
    if (callback) {
      clearTimeout(callback.timer);
      if ('e' in response && response.e) { // Error response
        callback.reject(new Error(response.e));
      } else {
        callback.resolve(response);
      }
      this.requestCallbacks.delete(response.id);
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
    logger.debug("Restarting wordserve client");
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
    this.isShuttingDown = true;
    this.isReady = false;
    if (this.process) {
      const processToKill = this.process;
      this.process = null; // Set to null first to prevent auto-restart
      processToKill.kill();
    }

    // Clean up all pending requests
    const pendingCallbacks = Array.from(this.requestCallbacks.entries());
    this.requestCallbacks.clear();
    this.usedRequestIds.clear();

    for (const [id, callback] of pendingCallbacks) {
      clearTimeout(callback.timer);
      callback.reject(new Error("WordServeClient is shutting down"));
    }
  }

  async updateConfigFile(updates: Partial<WordServePluginSettings>): Promise<boolean> {
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
}
