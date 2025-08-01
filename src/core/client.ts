import { Plugin } from "obsidian";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { decodeMulti, encode } from "@msgpack/msgpack";
import {
  BackendResponse,
  CompletionRequest,
  CompletionResponse,
  ConfigRequest,
  ConfigResponse,
  DictionaryRequest,
  DictionaryResponse,
  Suggestion,
  WordServePluginSettings,
} from "../types";
import { logger } from "../utils/logger";
import { AutoRespawnManager } from "../utils/autores";
import { WordServeDownloader } from "./downloader";
import { ConfigManager, ConfigUpdateRequest } from "./config-manager";

interface WordServePlugin extends Plugin {
  settings: WordServePluginSettings;
}

interface IdGenerator {
  counter: number;
}

const generateId = (() => {
  let counter = 0;
  return () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    counter = (counter || 0) + 1;
    return `${timestamp}-${random}-${counter}`;
  };
})();

export class WordServeClient {
  private process: child_process.ChildProcess | null = null;
  private plugin: WordServePlugin;
  private isReady: boolean = false;
  private requestCallbacks = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private autoRespawnManager: AutoRespawnManager;
  private usedRequestIds = new Set<string>();
  private isShuttingDown: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;
  private initializationMutex = false;
  private restartAttempts = 0;
  private maxRestartAttempts = 5;
  private restartBackoffMs = 1000;
  readonly configManager: ConfigManager;

  constructor(plugin: WordServePlugin) {
    this.plugin = plugin;
    this.autoRespawnManager = new AutoRespawnManager(
      plugin.settings.autorespawn,
      () => this.restart()
    );
    this.configManager = new ConfigManager(this);
    this.configManager.setRestartCallback(() => this.restart());
  }

  private sendRequest<T extends BackendResponse>(
    request: CompletionRequest | DictionaryRequest | ConfigRequest,
    timeout = 3000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error("WordServe process is not running."));
      }
      let id = generateId();
      let attempts = 0;
      const maxAttempts = 10;
      // unique ID
      while (this.usedRequestIds.has(id) && attempts < maxAttempts) {
        id = generateId();
        attempts++;
      }
      if (attempts >= maxAttempts) {
        return reject(new Error("Unable to generate unique request ID"));
      }
      this.usedRequestIds.add(id);
      request.id = id;
      const actualTimeout = request.hasOwnProperty("p")
        ? Math.min(timeout, 1500)
        : timeout;
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
    if (this.usedRequestIds.size > 1000) {
      this.cleanupOldRequestIds();
    }
  }

  private cleanupOldRequestIds(): void {
    const currentTime = Date.now();
    const oldIds = Array.from(this.usedRequestIds).filter((id) => {
      const timestampPart = id.split("-")[0];
      const timestamp = parseInt(timestampPart, 36);
      // 5min
      return currentTime - timestamp > 300000;
    });
    oldIds.forEach((id) => this.usedRequestIds.delete(id));
    if (oldIds.length > 0) {
      logger.debug(`Cleaned up ${oldIds.length} old request IDs`);
    }
  }

  /** Fetches word suggestions from core */
  async getSuggestions(query: string): Promise<Suggestion[]> {
    if (!this.isReady) {
      logger.warn("WordServeClient not ready, attempting to reinitialize...");
      const success = await this.initialize();
      if (!success) {
        return [];
      }
    }
    if (!this.process || this.process.killed) {
      logger.warn("Process is dead, attempting restart...");
      const success = await this.restart();
      if (!success) {
        return [];
      }
    }

    try {
      const maxSuggestions = Math.max(
        1,
        this.plugin.settings.maxSuggestions || 20
      );
      const request: CompletionRequest = {
        p: query,
        l: maxSuggestions,
      };
      if (maxSuggestions <= 0) {
        logger.warn(
          `Invalid maxSuggestions value: ${this.plugin.settings.maxSuggestions}, using default: 20`
        );
      }
      const response = await this.sendRequest<CompletionResponse>(request);
      this.autoRespawnManager.onSuggestionRequest().catch((err) => {
        logger.error("Auto-respawn tracking error:", err);
      });

      return response.s.map((s) => ({ word: s.w, rank: s.r }));
    } catch (error) {
      logger.error("Error fetching suggestions:", error);
      // If we get a timeout, the process might be dead - try to restart
      if (error.message.includes("timeout")) {
        logger.warn(
          "Request timeout, process might be unresponsive. Attempting restart..."
        );
        this.restart().catch((restartErr) => {
          logger.error("Failed to restart after timeout:", restartErr);
        });
      }
      return [];
    }
  }

  async initialize(): Promise<boolean> {
    if (this.initializationMutex) {
      if (this.initializationPromise) {
        return this.initializationPromise;
      }
      return false;
    }
    if (this.isReady) {
      return true;
    }
    this.initializationMutex = true;
    try {
      this.initializationPromise = this.doInitialize();
      return await this.initializationPromise;
    } finally {
      this.initializationMutex = false;
      this.initializationPromise = null;
    }
  }

  private async doInitialize(): Promise<boolean> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const vaultPath =
        "getBasePath" in adapter
          ? (adapter as { getBasePath(): string }).getBasePath()
          : "";
      const pluginDir = this.plugin.manifest.dir || ".";
      const pluginPath = path.join(vaultPath, pluginDir);
      const downloader = new WordServeDownloader(pluginPath);
      const downloadResult = await downloader.downloadAndInstall();

      if (!downloadResult.success) {
        throw new Error(
          downloadResult.error || "Failed to download WordServe binary"
        );
      }
      await this.startProcess();
      setTimeout(async () => {
        try {
          await this.configManager.ensureConfigLoaded();
        } catch (error) {
          logger.warn("Failed to load TOML config:", error);
        }
      }, 1000);
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
    const binaryName =
      os.platform() === "win32" ? "wordserve.exe" : "wordserve";
    const adapter = this.plugin.app.vault.adapter;
    const vaultPath =
      "getBasePath" in adapter
        ? (adapter as { getBasePath(): string }).getBasePath()
        : "";
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
      args.push("-v");
    }

    this.process = child_process.spawn(binaryPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.on("exit", (code) => {
      logger.debug(`wordserve process exited with code ${code}`);
      this.isReady = false;
      if (this.process !== null && !this.isShuttingDown) {
        if (this.restartAttempts < this.maxRestartAttempts) {
          const backoffDelay =
            this.restartBackoffMs * Math.pow(2, this.restartAttempts);
          this.restartAttempts++;
          logger.warn(
            `WordServe process died unexpectedly, attempting restart ${this.restartAttempts}/${this.maxRestartAttempts} in ${backoffDelay}ms...`
          );
          setTimeout(() => {
            this.restart().catch((err) => {
              logger.error("Failed to auto-restart wordserve process:", err);
            });
          }, backoffDelay);
        } else {
          logger.error(
            `WordServe process restart limit reached (${this.maxRestartAttempts}). Manual restart required.`
          );
        }
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

  private isBackendResponse(data: unknown): data is BackendResponse {
    return (
      typeof data === "object" &&
      data !== null &&
      "id" in data &&
      typeof (data as Record<string, unknown>).id === "string"
    );
  }

  private handleIncomingData(chunk: Buffer): void {
    try {
      for (const decoded of decodeMulti(chunk)) {
        if (this.isBackendResponse(decoded)) {
          this.processResponse(decoded);
        } else {
          logger.warn("Received invalid response format", decoded);
        }
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
      if ("e" in response && response.e) {
        callback.reject(new Error(response.e));
      } else {
        callback.resolve(response);
      }
      this.requestCallbacks.delete(response.id);
    } else {
      logger.warn(`No callback found for response ID: ${response.id}`);
    }
  }

  async getDictionaryInfo(): Promise<DictionaryResponse> {
    const request: DictionaryRequest = { action: "get_info" };
    return this.sendRequest<DictionaryResponse>(request);
  }

  async sendConfigRequest(request: ConfigRequest): Promise<ConfigResponse> {
    if (!this.isReady) {
      logger.warn(
        "WordServeClient not ready for config request, attempting to reinitialize..."
      );
      const success = await this.initialize();
      if (!success) {
        throw new Error(
          "Failed to initialize WordServeClient for config request"
        );
      }
    }
    if (!this.process || this.process.killed) {
      logger.warn("Process is dead for config request, attempting restart...");
      const success = await this.restart();
      if (!success) {
        throw new Error("Failed to restart WordServeClient for config request");
      }
    }
    return this.sendRequest<ConfigResponse>(request);
  }

  async restart(): Promise<boolean> {
    logger.debug("Restarting wordserve client");
    this.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const success = await this.initialize();
    if (success) {
      this.autoRespawnManager.reset();
      this.restartAttempts = 0;
    }
    return success;
  }

  cleanup() {
    this.isShuttingDown = true;
    this.isReady = false;
    if (this.process) {
      const processToKill = this.process;
      this.process = null;
      try {
        processToKill.kill();
      } catch (error) {
        logger.error("Error killing process during cleanup:", error);
      }
    }
    const pendingCallbacks = Array.from(this.requestCallbacks.entries());
    this.requestCallbacks.clear();
    this.usedRequestIds.clear();

    for (const [, callback] of pendingCallbacks) {
      try {
        clearTimeout(callback.timer);
        callback.reject(new Error("WordServeClient is shutting down"));
      } catch (error) {
        logger.error("Error cleaning up callback:", error);
      }
    }
    this.restartAttempts = 0;
    this.initializationMutex = false;
    this.initializationPromise = null;
  }

  async updateConfigFile(
    updates: Partial<WordServePluginSettings>
  ): Promise<boolean> {
    const configUpdates: ConfigUpdateRequest = {};
    if (updates.minPrefix !== undefined) {
      configUpdates.minPrefix = updates.minPrefix;
    }
    if (updates.maxSuggestions !== undefined) {
      configUpdates.maxLimit = updates.maxSuggestions;
    }
    return await this.configManager.updateConfig(configUpdates);
  }
  updateAutoRespawnConfig(config: {
    enabled: boolean;
    requestThreshold: number;
    timeThresholdMinutes: number;
  }): void {
    this.autoRespawnManager.updateConfig(config);
  }

  getConfigManager() {
    return this.configManager;
  }

  getCachedConfig() {
    return this.configManager.getCachedConfig();
  }

  async loadConfig() {
    return await this.configManager.loadConfig();
  }

  getAutoRespawnStats(): {
    requestCount: number;
    minutesSinceLastRespawn: number;
  } {
    return this.autoRespawnManager.getStats();
  }

  public cleanupMemory(): void {
    this.cleanupOldRequestIds();
    const now = Date.now();
    let expiredCount = 0;
    for (const [id, callback] of this.requestCallbacks.entries()) {
      const timestampPart = id.split("-")[0];
      const timestamp = parseInt(timestampPart, 36);
      if (now - timestamp > 300000) {
        clearTimeout(callback.timer);
        callback.reject(new Error("Request cleaned up due to age"));
        this.requestCallbacks.delete(id);
        expiredCount++;
      }
    }
    if (expiredCount > 0) {
      logger.debug(`Cleaned up ${expiredCount} expired callbacks`);
    }
  }
}
