interface WordServeSettings {
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

/** Singleton logger with category-specific debug control */
class WSLogger {
  private static instance: WSLogger;
  private debugEnabled = false;
  private debugSettings: WordServeSettings["debug"] = {
    msgpackData: false,
    menuRender: false,
    configChange: false,
    hotkeys: false,
    renderEvents: false,
    abbrEvents: false,
  };

  private constructor() {}

  static getInstance(): WSLogger {
    if (!WSLogger.instance) {
      WSLogger.instance = new WSLogger();
    }
    return WSLogger.instance;
  }

  setDebugMode(enabled: boolean): void {
    this.debugEnabled = enabled;
    if (enabled) {
      console.log("[WS] Debug mode ENABLED");
    }
  }

  setDebugSettings(debugSettings?: WordServeSettings["debug"]): void {
    if (debugSettings) {
      this.debugSettings = { ...this.debugSettings, ...debugSettings };
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(`[WS-D] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.info(`[WS-I] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WS-P] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[WS-E] ${message}`, ...args);
  }

  fatal(message: string, ...args: unknown[]): void {
    console.error(`[WS-F] ${message}`, ...args);
  }

  msgpack(message: string, data?: unknown): void {
    if (this.debugEnabled && this.debugSettings?.msgpackData) {
      console.log(`[MP] ${message}`);
      if (data !== undefined && data !== null) {
        console.log("[MP] Data:", data);
      }
    }
  }

  menu(message: string, ...args: unknown[]): void {
    if (this.debugEnabled && this.debugSettings?.menuRender) {
      console.log(`[MNU] ${message}`, ...args);
    }
  }

  config(message: string, ...args: unknown[]): void {
    if (this.debugEnabled && this.debugSettings?.configChange) {
      console.log(`[CFG] ${message}`, ...args);
    }
  }

  hotkey(message: string, ...args: unknown[]): void {
    if (this.debugEnabled && this.debugSettings?.hotkeys) {
      console.log(`[HK] ${message}`, ...args);
    }
  }

  render(message: string, ...args: unknown[]): void {
    if (this.debugEnabled && this.debugSettings?.renderEvents) {
      console.log(`[RNDR] ${message}`, ...args);
    }
  }

  abbrv(message: string, ...args: unknown[]): void {
    if (this.debugEnabled && this.debugSettings?.abbrEvents) {
      console.log(`[ABR] ${message}`, ...args);
    }
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
        const [level, message] = charmMatch;
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
}

export const logger = WSLogger.getInstance();
