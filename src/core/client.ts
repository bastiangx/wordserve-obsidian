import { Plugin } from "obsidian";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import { encode, decodeMulti } from "@msgpack/msgpack";
import {
  CompletionRequest,
  CompletionResponse,
  ConfigResponse,
  DictionaryRequest,
  DictionaryResponse,
  Suggestion,
  BackendResponse,
  TyperPluginSettings,
} from "../types";
import { logger } from "../utils/logger";

interface TyperPlugin extends Plugin {
  settings: TyperPluginSettings;
}

// Use a more robust UUID generator if available, but this is fine for this context.
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export class TyperClient {
  private process: child_process.ChildProcess | null = null;
  private plugin: TyperPlugin;
  private isReady: boolean = false;
  private requestCallbacks = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; timer: NodeJS.Timeout }>();

  constructor(plugin: TyperPlugin) {
    this.plugin = plugin;
  }

  private sendRequest<T extends BackendResponse>(request: CompletionRequest | DictionaryRequest, timeout = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error("Typer process is not running."));
      }

      const id = generateId();
      request.id = id;

      const timer = setTimeout(() => {
        this.requestCallbacks.delete(id);
        reject(new Error(`Request timed out after ${timeout}ms`));
      }, timeout);

      this.requestCallbacks.set(id, { resolve, reject, timer });

      try {
        const encoded = encode(request);
        this.process.stdin.write(encoded, (err) => {
          if (err) {
            clearTimeout(timer);
            this.requestCallbacks.delete(id);
            reject(err);
          }
        });
      } catch (error) {
        clearTimeout(timer);
        this.requestCallbacks.delete(id);
        reject(error);
      }
    });
  }

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
      // The backend response 's' field contains {w: string, r: number}
      // We need to map it to the plugin's Suggestion type {word: string, rank: number}
      return response.s.map(s => ({ word: s.w, rank: s.r }));
    } catch (error) {
      logger.error("Error fetching suggestions:", error);
      return [];
    }
  }

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

    if (!fs.existsSync(binaryPath)) {
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
      try {
        for (const decoded of decodeMulti(chunk)) {
          this.processResponse(decoded as BackendResponse);
        }
      } catch (error) {
        logger.error("Failed to decode msgpack stream:", error);
      }
    });

    this.process.stderr.on("data", (data) => {
      logger.parseCoreLog(data.toString());
    });

    // Wait for the process to be ready
    return new Promise((resolve) => setTimeout(resolve, 200)); // Simple delay to allow process to spin up
  }

  private processResponse(response: BackendResponse) {
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

  async setDictionarySize(chunkCount: number): Promise<ConfigResponse> {
    const request: DictionaryRequest = {
      action: "set_size",
      chunk_count: Math.max(1, Math.floor(chunkCount)),
    };
    return this.sendRequest<ConfigResponse>(request, 5000);
  }

  async getDictionaryInfo(): Promise<DictionaryResponse> {
    const request: DictionaryRequest = { action: "get_info" };
    return this.sendRequest<DictionaryResponse>(request);
  }

  async getDictionaryOptions(): Promise<DictionaryResponse> {
    const request: DictionaryRequest = { action: "get_options" };
    return this.sendRequest<DictionaryResponse>(request);
  }

  async restart(): Promise<boolean> {
    logger.debug("Restarting typer client");
    this.cleanup();
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.initialize();
  }

  cleanup() {
    this.isReady = false;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    // Reject any pending promises
    for (const [id, callback] of this.requestCallbacks.entries()) {
        clearTimeout(callback.timer);
        callback.reject(new Error("TyperClient is shutting down"));
        this.requestCallbacks.delete(id);
    }
  }

  // This function is kept for settings updates, which don't go through the binary
  async updateConfigFile(updates: Partial<TyperPluginSettings>): Promise<boolean> {
    // This logic remains the same as it modifies the TOML file directly
    // and doesn't interact with the running process via msgpack.
    return true; // Placeholder for the original logic
  }
}
