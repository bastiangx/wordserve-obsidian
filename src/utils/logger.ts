import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as TOML from "@iarna/toml";

interface WordServeSettings {
  debugMode?: boolean;
  debug?: Record<string, unknown>;
}

/** Singleton logger with category-specific debug control */
class WSLogger {
  private static instance: WSLogger;
  private debugEnabled = false;
  private logDirectoryPath: string;
  private errorLogFilePath: string;

  private constructor() {
    const baseDir = path.join(os.tmpdir(), "wordserve");
    this.logDirectoryPath = baseDir;
    this.errorLogFilePath = path.join(baseDir, "error-log.toml");
    this.ensureLogDirectory();
  }

  static getInstance(): WSLogger {
    if (!WSLogger.instance) {
      WSLogger.instance = new WSLogger();
    }
    return WSLogger.instance;
  }

  setDebugMode(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  setDebugSettings(_debugSettings?: WordServeSettings["debug"]): void {}

  debug(_message: string, ..._args: unknown[]): void {
    // suppressed
  }

  info(_message: string, ..._args: unknown[]): void {
    // suppressed
  }

  warn(message: string, ...args: unknown[]): void {
    this.appendErrorLog("WARN", message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.appendErrorLog("ERROR", message, args);
  }

  fatal(message: string, ...args: unknown[]): void {
    this.appendErrorLog("FATAL", message, args);
  }

  config(_message: string, ..._args: unknown[]): void {
    // suppressed
  }

  abbrv(_message: string, ..._args: unknown[]): void {
    // suppressed
  }

  /** Parses and categorizes log output from the backend core */
  parseCoreLog(logOutput: string): void {
    const lines = logOutput.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      const charmMatch = line.match(
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?\s*(FATA|ERROR|WARN|INFO|DEBUG)\s+(.+)/
      );
      if (charmMatch) {
        const level = charmMatch[2];
        const message = charmMatch[3];
        const logMessage = `[COR] ${message}`;
        switch (level) {
          case "FATA":
            this.fatal(logMessage);
            break;
          case "ERROR":
            this.error(logMessage);
            break;
          case "WARN":
            this.warn(logMessage);
            break;
          case "INFO":
            this.info(logMessage);
            break;
          case "DEBUG":
            if (this.debugEnabled) this.debug(logMessage);
            break;
        }
        continue;
      }
      const fatalMatch = line.match(/FATA.*?(.*)/);
      if (fatalMatch) {
        this.fatal(`[COR-F] ${fatalMatch[1] || line}`);
        continue;
      }
      const errorMatch = line.match(/ERROR.*?(.*)/);
      if (errorMatch) {
        this.error(`[COR-E] ${errorMatch[1] || line}`);
        continue;
      }
      const warnMatch = line.match(/WARN.*?(.*)/);
      if (warnMatch) {
        this.warn(`[COR-W] ${warnMatch[1] || line}`);
        continue;
      }
      const debugMatch = line.match(/DEBUG.*?(.*)/);
      if (debugMatch && this.debugEnabled) {
        this.debug(`[COR-D] ${debugMatch[1] || line}`);
        continue;
      }
      if (
        line.includes("Failed") ||
        line.includes("Error") ||
        line.includes("error")
      ) {
        this.error(`[COR-E] ${line}`);
      } else if (this.debugEnabled) {
        this.debug(`[Core] ${line}`);
      }
    }
  }

  getErrorLogFilePath(): string {
    return this.errorLogFilePath;
  }

  async readErrorLog(): Promise<string> {
    try {
      return await fs.promises.readFile(this.errorLogFilePath, "utf8");
    } catch {
      return "";
    }
  }

  async clearErrorLog(): Promise<void> {
    try {
      await fs.promises.writeFile(this.errorLogFilePath, "");
    } catch {
      // swallow
    }
  }

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDirectoryPath)) {
        fs.mkdirSync(this.logDirectoryPath, { recursive: true });
      }
      if (!fs.existsSync(this.errorLogFilePath)) {
        fs.writeFileSync(this.errorLogFilePath, "");
      }
    } catch {
      // swallow
    }
  }

  private appendErrorLog(
    level: "WARN" | "ERROR" | "FATAL",
    message: string,
    args: unknown[]
  ): void {
    try {
      const base: TOML.JsonMap = {
        time: new Date().toISOString(),
        level,
        message,
      };
      const ctx = this.formatArgs(args);
      if (ctx !== undefined) {
        base.context = ctx;
      }
      const toml = "[[log]]\n" + TOML.stringify(base);
      fs.appendFile(this.errorLogFilePath, toml, () => {
        // ignore callback errors
      });
    } catch {
      // swallow
    }
  }

  private formatArgs(args: unknown[]): string | undefined {
    if (!args || args.length === 0) return undefined;
    try {
      return JSON.stringify(args, this.safeReplacer, 2);
    } catch {
      try {
        return String(args);
      } catch {
        return undefined;
      }
    }
  }

  private safeReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    return value;
  }
}

export const logger = WSLogger.getInstance();
