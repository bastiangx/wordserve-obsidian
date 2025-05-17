import { Plugin } from "obsidian";
import * as child_process from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// Define an interface for the response from the backend
export interface CompletionResponse {
  suggestions: Suggestion[];
  count: number;
  prefix: string;
  time_ms: number;
  was_corrected?: boolean;
  corrected_prefix?: string;
}

export interface StatusResponse {
  status: string;
  requestId?: string; // requestId might also be part of a status update
}

export type BackendResponse = CompletionResponse | StatusResponse;

export interface Suggestion {
  word: string;
  rank: number;
  freq?: number;
}

export class TyprIPC {
  private process: child_process.ChildProcess | null = null;
  private plugin: Plugin;
  private isReady: boolean = false;
  private pendingCallbacks: Map<string, (data: BackendResponse) => void> = new Map();
  
  // Store last few requests to avoid duplicates within a short time window
  private lastRequests: Set<string> = new Set();
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  async initialize(): Promise<boolean> {
    if (this.isReady) return true;
    
    try {
      await this.startProcess();
      return this.isReady;
    } catch (error) {
      console.error("Failed to initialize TyprIPC:", error);
      return false;
    }
  }

  private async startProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const platform = os.platform(); // 'darwin', 'linux', 'win32'
        const binaryName = platform === "win32" ? "main.exe" : "main";

        // Use the correct method to get the vault path
        const adapter = this.plugin.app.vault.adapter;
        const vaultPath =
          "getBasePath" in adapter
            ? (adapter as { getBasePath(): string }).getBasePath() // For FileSystemAdapter (desktop)
            : ""; // For mobile, but the Go binary approach won't work there anyway

        // Path to the plugin directory within the vault
        const pluginDir = path.join(
          vaultPath,
          ".obsidian",
          "plugins",
          "typr-obsidian"
        );

        // Path to the binary inside the plugin directory
        const binaryPath = path.join(pluginDir, binaryName);
        const binaryDir = path.join(pluginDir, "binaries");

        console.log(`Attempting to execute typr-lib at: ${binaryPath}`);

        // Check if binary exists
        if (!fs.existsSync(binaryPath)) {
          const error = `Binary not found at: ${binaryPath}`;
          console.error(error);
          reject(error);
          return;
        }

        // Spawn the Go process
        this.process = child_process.spawn(
          binaryPath,
          [`--binaries=${binaryDir}`],
          {
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        // Handle process exit
        this.process.on("exit", (code) => {
          console.log(`typr-lib process exited with code ${code}`);
          this.isReady = false;
          this.process = null;
        });

        // Listen for data from the process
        this.process.stdout?.on("data", (data) => {
          const responseStr = data.toString().trim();
          console.log(`Received from Go: ${responseStr}`);

          try {
            // Attempt to parse as JSON. If it fails, it might be a log message.
            let response: BackendResponse;
            try {
              response = JSON.parse(responseStr) as BackendResponse;
            } catch {
              // If JSON.parse fails, assume it's a log message and ignore for callback processing
              return; // Do not proceed if it's not valid JSON
            }

            // Check if this is the ready message
            if ('status' in response && response.status === "ready") {
              this.isReady = true;
              console.log("typr-lib backend is ready");
              resolve();
              return;
            }

            // Process the response based on requestId if available
            // Ensure response has requestId and it's a string before proceeding
            const requestId = 'requestId' in response && typeof response.requestId === 'string' ? response.requestId : undefined;
            if (requestId && this.pendingCallbacks.has(requestId)) {
              const callback = this.pendingCallbacks.get(requestId);
              this.pendingCallbacks.delete(requestId);
              if (callback) callback(response);
            }
          } catch (error) {
            console.error("Error processing response:", error, responseStr);
          }
        });

        // Listen for errors
        this.process.stderr?.on("data", (data) => {
          console.log(`Log from Go: ${data.toString()}`);
        });

        // If process doesn't become ready in 5 seconds, reject
        setTimeout(() => {
          if (!this.isReady) {
            reject("Timeout waiting for typr-lib to become ready");
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getCompletions(
    prefix: string,
    fuzzy: boolean = true,
    limit: number = 4
  ): Promise<CompletionResponse> {
    // Check if we've sent this exact request recently (avoid duplicates)
    const requestKey = `${prefix}-${fuzzy}-${limit}`;
    if (this.lastRequests.has(requestKey)) {
      return Promise.reject("Duplicate request");
    }
    
    // Add to recent requests set
    this.lastRequests.add(requestKey);
    
    // Clear the set after a short delay to allow future identical requests
    setTimeout(() => {
      this.lastRequests.delete(requestKey);
    }, 500);
    
    if (!this.process || !this.isReady) {
      try {
        await this.startProcess();
      } catch (error) {
        console.error("Failed to start process:", error);
        return Promise.reject("Backend not available");
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const requestId = Date.now().toString();

        // Set up callback for this request
        this.pendingCallbacks.set(requestId, (response) => {
          if ('suggestions' in response) {
            resolve(response as CompletionResponse);
          } else {
            // This case should ideally not happen if the backend sends correct CompletionResponse for 'complete' command
            reject("Received unexpected response type for completion request");
          }
        });

        // Prepare the request
        const request = {
          command: "complete",
          requestId,
          prefix,
          fuzzy,
          limit,
        };

        // Send the request
        this.sendData(JSON.stringify(request));

        // Set timeout to remove callback if no response
        setTimeout(() => {
          if (this.pendingCallbacks.has(requestId)) {
            this.pendingCallbacks.delete(requestId);
            reject("Timeout waiting for completion response");
          }
        }, 2000);
      } catch (error) {
        reject(error);
      }
    });
  }

  private sendData(data: string) {
    if (this.process && this.process.stdin) {
      this.process.stdin.write(data + "\n");
      console.log(`Sent to Go: ${data}`);
    } else {
      console.error("Process not started or stdin not available");
      throw new Error("Process not started or stdin not available");
    }
  }

  cleanup() {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isReady = false;
      this.pendingCallbacks.clear();
      this.lastRequests.clear();
    }
  }
}
