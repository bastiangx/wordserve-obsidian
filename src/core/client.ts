import { Plugin } from "obsidian";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import { encode, decode } from "@msgpack/msgpack";
import {
  CompletionRequest,
  CompletionResponse,
  ConfigUpdateRequest,
  ConfigResponse,
  CompletionError,
} from "../types";

export class TyperClient {
  private process: child_process.ChildProcess | null = null;
  private plugin: Plugin;
  private isReady: boolean = false;
  private responseBuffer: Buffer = Buffer.alloc(0);

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  async initialize(): Promise<boolean> {
    if (this.isReady) {
      return true;
    }

    try {
      await this.startProcess();
      return this.isReady;
    } catch (error) {
      console.error("Failed to initialize TyperClient:", error);
      return false;
    }
  }

  private async startProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const binaryName = process.platform === "win32" ? "typer.exe" : "typer";
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
        const binaryDir = path.join(pluginDir, "data");

        const possibleBinaryPaths = [
          path.join(pluginDir, binaryName),
          path.join(pluginDir, "typer-lib", "typer"),
          path.join(pluginDir, "typer"),
          path.join(pluginDir, "data", binaryName),
          path.join(__dirname, "..", "..", binaryName),
        ];

        let binaryPath = "";
        for (const testPath of possibleBinaryPaths) {
          if (fs.existsSync(testPath)) {
            binaryPath = testPath;
            break;
          }
        }

        if (!binaryPath) {
          reject(new Error(`Typer binary not found. Searched: ${possibleBinaryPaths.join(", ")}`));
          return;
        }

        const args = [`--data=${binaryDir}`];

        this.process = child_process.spawn(binaryPath, args, {
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.process.on("exit", (code) => {
          console.log(`typer process exited with code ${code}`);
          this.cleanup();
        });

        this.process.on("error", (error) => {
          console.error("Process error:", error);
          reject(error);
        });

        this.process.stdout?.on("data", (data: Buffer) => {
          this.handleBinaryData(data);
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          console.log(`Typer log: ${data.toString()}`);
        });

        // Test connection with simple request
        setTimeout(async () => {
          try {
            await this.testConnection();
            this.isReady = true;
            resolve();
          } catch (error) {
            reject(new Error("Failed to establish connection with typer process"));
          }
        }, 200);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleBinaryData(data: Buffer) {
    try {
      // Append new data to buffer
      this.responseBuffer = Buffer.concat([this.responseBuffer, data]);

      // Try to decode messages one by one
      while (this.responseBuffer.length > 0) {
        try {
          const decoded = decode(this.responseBuffer);
          // If successful, clear the buffer as we consumed all data
          this.responseBuffer = Buffer.alloc(0);
          this.processResponse(decoded);
          break;
        } catch (error) {
          // Not enough data yet, wait for more
          break;
        }
      }
    } catch (error) {
      console.error("Error processing binary data:", error);
    }
  }

  private processResponse(response: any) {
    console.log("Received response:", response);

    // Handle completion response
    if (response.s && Array.isArray(response.s)) {
      const completionResponse: CompletionResponse = {
        s: response.s,
        c: response.c || response.s.length,
        t: response.t || 0,
        suggestions: response.s.map((s: any, index: number) => ({
          word: s.w,
          rank: s.r || index + 1,
        })),
      };
      this.resolvePromise(completionResponse);
      return;
    }

    // Handle error response
    if (response.e) {
      const error = new Error(`${response.e} (code: ${response.c || 0})`);
      this.rejectPromise(error);
      return;
    }

    // Handle config response
    if (response.status) {
      this.resolvePromise(response);
      return;
    }

    console.warn("Unknown response format:", response);
  }

  private currentPromise: {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  } | null = null;

  private resolvePromise(value: any) {
    if (this.currentPromise) {
      this.currentPromise.resolve(value);
      this.currentPromise = null;
    }
  }

  private rejectPromise(error: Error) {
    if (this.currentPromise) {
      this.currentPromise.reject(error);
      this.currentPromise = null;
    }
  }

  private async testConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.currentPromise) {
        reject(new Error("Request already in progress"));
        return;
      }

      this.currentPromise = { resolve: () => resolve(), reject };

      const testRequest: CompletionRequest = { p: "test", l: 1 };

      try {
        this.sendMsgPackData(testRequest);
      } catch (error) {
        this.currentPromise = null;
        reject(error);
      }

      setTimeout(() => {
        if (this.currentPromise) {
          this.currentPromise = null;
          reject(new Error("Connection test timeout"));
        }
      }, 3000);
    });
  }

  async getCompletions(
    prefix: string,
    limit: number = 4
  ): Promise<CompletionResponse> {
    if (!this.process || !this.isReady) {
      await this.initialize();
    }

    if (!prefix || prefix.trim().length === 0) {
      throw new Error("Empty prefix");
    }

    return new Promise((resolve, reject) => {
      if (this.currentPromise) {
        reject(new Error("Request already in progress"));
        return;
      }

      this.currentPromise = { resolve, reject };

      const request: CompletionRequest = {
        p: prefix.trim(),
        l: limit,
      };

      try {
        this.sendMsgPackData(request);
      } catch (error) {
        this.currentPromise = null;
        reject(error);
      }

      setTimeout(() => {
        if (this.currentPromise) {
          this.currentPromise = null;
          reject(new Error("Request timeout"));
        }
      }, 3000);
    });
  }

  async updateConfig(config: ConfigUpdateRequest): Promise<ConfigResponse> {
    if (!this.process || !this.isReady) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      if (this.currentPromise) {
        reject(new Error("Request already in progress"));
        return;
      }

      this.currentPromise = { resolve, reject };

      try {
        this.sendMsgPackData(config);
      } catch (error) {
        this.currentPromise = null;
        reject(error);
      }

      setTimeout(() => {
        if (this.currentPromise) {
          this.currentPromise = null;
          reject(new Error("Config update timeout"));
        }
      }, 3000);
    });
  }

  private sendMsgPackData(data: any) {
    if (!this.process || !this.process.stdin) {
      throw new Error("Process not available");
    }

    const encoded = encode(data);
    this.process.stdin.write(encoded);
  }

  cleanup() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isReady = false;
    this.responseBuffer = Buffer.alloc(0);
    this.currentPromise = null;
  }
}
