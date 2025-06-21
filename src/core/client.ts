import { Plugin } from "obsidian";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import { BackendResponse, CompletionResponse } from "../types";

export class TyperClient {
  private process: child_process.ChildProcess | null = null;
  private plugin: Plugin;
  private isReady: boolean = false;
  private pendingCallbacks: Map<string, (data: BackendResponse) => void> =
    new Map();

  // caching last req
  private lastRequests: Set<string> = new Set();

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  async initialize(): Promise<boolean> {
    console.log("client: initialize called");
    if (this.isReady) {
      console.log("TyperIPC: already initialized");
      return true;
    }

    try {
      await this.startProcess();
      console.log("TyperIPC: initialization complete, isReady =", this.isReady);
      return this.isReady;
    } catch (error) {
      console.error("Failed to initialize TyperIPC:", error);
      return false;
    }
  }

  private async startProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const binaryName = "typer";

        const adapter = this.plugin.app.vault.adapter;
        const vaultPath =
          "getBasePath" in adapter
            ? (adapter as { getBasePath(): string }).getBasePath()
            : "";

        const pluginDir = path.join(
          vaultPath,
          ".obsidian",
          "plugins",
          "typer-obsidian"
        );
        const binaryDir = path.join(pluginDir, "binaries");
        
        // Check for the binary in several locations
        const possibleBinaryPaths = [
          path.join(pluginDir, binaryName),  // Main plugin directory
          path.join(pluginDir, "typer", binaryName),  // Subdirectory
          path.join(pluginDir, "binaries", binaryName),  // Binaries directory
          path.join(__dirname, "..", "..", binaryName),  // Root directory relative to this file
        ];

        let binaryPath = "";
        for (const testPath of possibleBinaryPaths) {
          if (fs.existsSync(testPath)) {
            binaryPath = testPath;
            console.log("TyperIPC: Found binary at", binaryPath);
            break;
          }
        }

        if (!binaryPath) {
          console.error("TyperIPC: Binary not found in any of:", possibleBinaryPaths);
          reject(new Error("Typer binary not found"));
          return;
        }

        const args = [`--binaries=${binaryDir}`];
        console.log("TyperIPC: Spawning process with args:", args);
        
        this.process = child_process.spawn(
          binaryPath,
          args,
          {
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        this.process.on("exit", (code) => {
          console.log(`typer-lib process exited with code ${code}`);
          this.isReady = false;
          this.process = null;
        });

        this.process.stdout?.on("data", (data) => {
          const responseStr = data.toString().trim();
          console.log(`Received from Go: ${responseStr}`);

          try {
            let response: BackendResponse;
            try {
              response = JSON.parse(responseStr) as BackendResponse;
            } catch {
              return;
            }

            if ("status" in response && response.status === "ready") {
              this.isReady = true;
              console.log("typer-lib backend is ready");
              resolve();
              return;
            }

            // Process the response based on requestId if available
            const requestId =
              "requestId" in response && typeof response.requestId === "string"
                ? response.requestId
                : undefined;
                
            if (requestId && this.pendingCallbacks.has(requestId)) {
              console.log("TyperIPC: Processing response for requestId", requestId, response);
              const callback = this.pendingCallbacks.get(requestId);
              this.pendingCallbacks.delete(requestId);
              if (callback) callback(response);
            } else if ("suggestions" in response && this.pendingCallbacks.size > 0) {
              // no requestID
              console.log("TyperIPC: Processing suggestions response without requestId", response);
              const oldestRequestId = Array.from(this.pendingCallbacks.keys())[0];
              if (oldestRequestId) {
                const callback = this.pendingCallbacks.get(oldestRequestId);
                this.pendingCallbacks.delete(oldestRequestId);
                if (callback) callback(response);
              }
            } else {
              console.log("TyperIPC: Response has no matching callback", response);
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
            reject("Timeout waiting for typer-lib to become ready");
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
    console.log("TyperIPC: getCompletions called", prefix, fuzzy, limit);
    
    // Check if duplicate
    const requestKey = `${prefix}-${fuzzy}-${limit}`;
    if (this.lastRequests.has(requestKey)) {
      console.log("TyperIPC: Duplicate request rejected", requestKey);
      return Promise.reject("Duplicate request");
    }
    this.lastRequests.add(requestKey);

    setTimeout(() => {
      this.lastRequests.delete(requestKey);
    }, 2000);

    if (!this.process || !this.isReady) {
      console.log("TyperIPC: Process not ready, attempting to start");
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

        this.pendingCallbacks.set(requestId, (response) => {
          if ("suggestions" in response) {
            resolve(response as CompletionResponse);
          } else {
            reject(
              "Error: Received unexpected response type for completion request"
            );
          }
        });

        const request = {
          command: "complete",
          requestId,
          prefix,
          fuzzy,
          limit,
        };
        this.sendData(JSON.stringify(request));

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
