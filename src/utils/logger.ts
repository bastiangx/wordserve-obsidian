export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface TyperSettings {
  debugMode?: boolean;
  debug?: {
    msgpackData?: boolean;
    menuRender?: boolean;
    configChange?: boolean;
    hotkeys?: boolean;
    renderEvents?: boolean;
    abbrEvents?: boolean;
  };
}

class TyperLogger {
  private static instance: TyperLogger;
  private debugEnabled = false;
  private debugSettings: TyperSettings["debug"] = {
    msgpackData: false,
    menuRender: false,
    configChange: false,
    hotkeys: false,
    renderEvents: false,
    abbrEvents: false,
  };

  private constructor() {}

  static getInstance(): TyperLogger {
    if (!TyperLogger.instance) {
      TyperLogger.instance = new TyperLogger();
    }
    return TyperLogger.instance;
  }

  setDebugMode(enabled: boolean): void {
    this.debugEnabled = enabled;
    if (enabled) {
      console.log("[TYPER] Debug mode ENABLED");
    }
  }

  setDebugSettings(debugSettings?: TyperSettings["debug"]): void {
    if (debugSettings) {
      this.debugSettings = { ...this.debugSettings, ...debugSettings };
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      console.log(`[TYPER-DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      console.info(`[TYPER-INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[TYPER-WARN] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[TYPER-ERROR] ${message}`, ...args);
  }

  fatal(message: string, ...args: any[]): void {
    console.error(`[TYPER-FATAL] ${message}`, ...args);
  }

  // Specialized debug methods with prefixes
  msgpack(message: string, data?: any): void {
    if (this.debugEnabled && this.debugSettings?.msgpackData) {
      console.log(`[MP] ${message}`);
      if (data !== undefined && data !== null) {
        console.log("[MP] Data:", data);
      }
    }
  }

  menu(message: string, ...args: any[]): void {
    if (this.debugEnabled && this.debugSettings?.menuRender) {
      console.log(`[MNU] ${message}`, ...args);
    }
  }

  config(message: string, ...args: any[]): void {
    if (this.debugEnabled && this.debugSettings?.configChange) {
      console.log(`[CFG] ${message}`, ...args);
    }
  }

  hotkey(message: string, ...args: any[]): void {
    if (this.debugEnabled && this.debugSettings?.hotkeys) {
      console.log(`[HK] ${message}`, ...args);
    }
  }

  render(message: string, ...args: any[]): void {
    if (this.debugEnabled && this.debugSettings?.renderEvents) {
      console.log(`[RNDR] ${message}`, ...args);
    }
  }

  abbrv(message: string, ...args: any[]): void {
    if (this.debugEnabled && this.debugSettings?.abbrEvents) {
      console.log(`[ABR] ${message}`, ...args);
    }
  }

  parseCoreLog(logOutput: string): void {
    const lines = logOutput.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      // Handle charmbracelet/log format: timestamp LEVEL message
      const charmMatch = line.match(
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?\s*(FATA|ERROR|WARN|INFO|DEBUG)\s+(.+)/
      );
      if (charmMatch) {
        const [, timestamp, level, message] = charmMatch;
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

      // Fallback
      const fatalMatch = line.match(/FATA.*?(.*)/);
      if (fatalMatch) {
        this.fatal(`[COR] ${fatalMatch[1] || line}`);
        continue;
      }

      const errorMatch = line.match(/ERROR.*?(.*)/);
      if (errorMatch) {
        this.error(`[COR] ${errorMatch[1] || line}`);
        continue;
      }

      const warnMatch = line.match(/WARN.*?(.*)/);
      if (warnMatch) {
        this.warn(`[COR] ${warnMatch[1] || line}`);
        continue;
      }

      const debugMatch = line.match(/DEBUG.*?(.*)/);
      if (debugMatch && this.debugEnabled) {
        this.debug(`[COR] ${debugMatch[1] || line}`);
        continue;
      }

      // Handle common error indicators
      if (
        line.includes("Failed") ||
        line.includes("Error") ||
        line.includes("error")
      ) {
        this.error(`[COR] ${line}`);
      } else if (this.debugEnabled) {
        this.debug(`[Core] ${line}`);
      }
    }
  }
}

export const logger = TyperLogger.getInstance();
