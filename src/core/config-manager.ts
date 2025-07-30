import * as fs from "fs";
import * as toml from "@iarna/toml";
import { logger } from "../utils/logger";
import { WordServeClient } from "./client";

export interface TomlServerConfig {
  max_limit: number;
  min_prefix: number;
  max_prefix: number;
  enable_filter: boolean;
}

export interface TomlDictConfig {
  max_words: number;
  chunk_size: number;
  min_frequency_threshold: number;
  min_frequency_short_prefix: number;
  max_word_count_validation: number;
}

export interface TomlCliConfig {
  default_limit: number;
  default_min_len: number;
  default_max_len: number;
  default_no_filter: boolean;
}

export interface TomlConfig {
  server: TomlServerConfig;
  dict: TomlDictConfig;
  cli: TomlCliConfig;
}

export interface ConfigUpdateRequest {
  minPrefix?: number;
  maxLimit?: number;
  dictionarySize?: number;
}

/** Manages config interface with WordServe core */
export class ConfigManager {
  private client: WordServeClient;
  private configPath: string | null = null;
  private cachedConfig: TomlConfig | null = null;
  private restartCallback: (() => Promise<boolean>) | null = null;

  constructor(client: WordServeClient) {
    this.client = client;
  }

  setRestartCallback(callback: () => Promise<boolean>) {
    this.restartCallback = callback;
  }

  async getConfigPath(): Promise<string | null> {
    try {
      const response = await this.client.sendConfigRequest({
        action: "get_config_path",
      });
      if (response.status === "ok" && response.config_path) {
        this.configPath = response.config_path;
        logger.config(`Core config path: ${this.configPath}`);
        return this.configPath;
      }
      logger.error(
        "Failed to get config path from core:",
        response.error || "Unknown error"
      );
      return null;
    } catch (error) {
      logger.error("Error getting config path:", error);
      return null;
    }
  }

  private isTomlConfig(data: unknown): data is TomlConfig {
    return (
      typeof data === "object" &&
      data !== null &&
      "server" in data &&
      "dict" in data &&
      "cli" in data
    );
  }

  async loadConfig(): Promise<TomlConfig | null> {
    const configPath = await this.getConfigPath();
    if (!configPath) {
      return null;
    }
    try {
      const configContent = await fs.promises.readFile(configPath, "utf-8");
      const parsedConfig = toml.parse(configContent);
      if (!this.isTomlConfig(parsedConfig)) {
        logger.error("Invalid TOML config format");
        return null;
      }
      this.cachedConfig = parsedConfig;
      logger.config("Loaded TOML config:", parsedConfig);
      return parsedConfig;
    } catch (error) {
      logger.error(`Failed to load config from ${configPath}:`, error);
      return null;
    }
  }

  async updateConfig(updates: ConfigUpdateRequest): Promise<boolean> {
    const configPath = await this.getConfigPath();
    if (!configPath) {
      logger.error("Cannot update config: no config path available");
      return false;
    }
    try {
      let config = this.cachedConfig;
      if (!config) {
        config = await this.loadConfig();
        if (!config) {
          logger.error("Cannot load current config for update");
          return false;
        }
      }
      let hasChanges = false;
      if (
        updates.minPrefix !== undefined &&
        updates.minPrefix !== config.server.min_prefix
      ) {
        config.server.min_prefix = updates.minPrefix;
        hasChanges = true;
        logger.config(`Updated min_prefix: ${updates.minPrefix}`);
      }
      if (
        updates.maxLimit !== undefined &&
        updates.maxLimit !== config.server.max_limit
      ) {
        config.server.max_limit = updates.maxLimit;
        hasChanges = true;
        logger.config(`Updated max_limit: ${updates.maxLimit}`);
      }
      if (updates.dictionarySize !== undefined) {
        const maxWords = updates.dictionarySize * config.dict.chunk_size;
        if (maxWords !== config.dict.max_words) {
          config.dict.max_words = maxWords;
          hasChanges = true;
          logger.config(
            `Updated dictionary max_words: ${maxWords} (${updates.dictionarySize} chunks)`
          );
        }
      }
      if (!hasChanges) {
        return true;
      }
      const tomlContent = toml.stringify(config as unknown as toml.JsonMap);
      await fs.promises.writeFile(configPath, tomlContent, "utf-8");
      this.cachedConfig = config;
      logger.config(`Successfully updated config file: ${configPath}`);
      // Force restart client
      if (this.restartCallback) {
        const restartSuccess = await this.restartCallback();
        if (!restartSuccess) {
          logger.warn("Config file updated but client restart failed");
          return false;
        }
        logger.config(
          "WordServe client restarted successfully with new config"
        );
      } else {
        logger.warn(
          "No restart callback set, config changes may not take effect until restart"
        );
      }
      return true;
    } catch (error) {
      logger.error("Failed to update config file:", error);
      return false;
    }
  }

  getCachedConfig(): TomlConfig | null {
    return this.cachedConfig;
  }

  async ensureConfigLoaded(): Promise<boolean> {
    if (this.cachedConfig) {
      return true;
    }

    const config = await this.loadConfig();
    return config !== null;
  }
}
