import { App, normalizePath, Notice, Plugin } from "obsidian";
import { AbbreviationEntry, AbbreviationMap } from "../types";
import { CONFIG } from "./config";
import { logger } from "../utils/logger";
import * as path from "path";

/** Manages text abbreviations that expand shortcuts to full text. */
export class AbbreviationManager {
  private app: App;
  private plugin: Plugin;
  private abbreviations: AbbreviationMap = {};
  readonly filePath: string;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.filePath = this.getPluginDataPath();
    logger.abbrv(`Using abbreviation file path: ${this.filePath}`);
    this.initialize().then(() =>
      logger.abbrv(
        `init with ${Object.keys(this.abbreviations).length} abbreviations`
      )
    );
  }

  private getPluginDataPath(): string {
    return normalizePath(
      path.join(
        this.plugin.app.vault.configDir,
        "plugins",
        this.plugin.manifest.id,
        "data",
        "abbrv-map.json"
      )
    );
  }

  private async initialize(): Promise<void> {
    try {
      await this.loadAbbreviations();
    } catch (error) {
      logger.abbrv(
        "Failed to load abbreviations, creating default file",
        error
      );
      await this.createDefaultFile();
    }
  }

  private async loadAbbreviations(): Promise<void> {
    try {
      // Try to load from plugin data first
      const pluginData = await this.plugin.loadData();
      if (pluginData?.abbreviations) {
        if (this.validateAbbreviationMap(pluginData.abbreviations)) {
          this.abbreviations = pluginData.abbreviations;
          logger.abbrv(
            `Loaded ${Object.keys(this.abbreviations).length} abbreviations from plugin data`
          );
          return;
        }
      }
      // only fallback if plg data not valid
      let fileExists: boolean;
      try {
        await this.app.vault.adapter.stat(this.filePath);
        fileExists = true;
      } catch {
        fileExists = false;
      }

      if (!fileExists) {
        await this.createDefaultFile();
        return;
      }

      const content = await this.app.vault.adapter.read(this.filePath);
      const data = JSON.parse(content);

      if (this.validateAbbreviationMap(data)) {
        this.abbreviations = data;
        logger.abbrv(
          `Loaded ${Object.keys(this.abbreviations).length} abbreviations`
        );
        // Migrate to plugin data storage
        await this.saveAbbreviations();
      } else {
        logger.abbrv("Invalid abbreviation data, creating default file");
        await this.createDefaultFile();
      }
    } catch (error) {
      logger.abbrv("Error loading abbreviations", error);
      await this.createDefaultFile();
    }
  }

  private async createDefaultFile(): Promise<void> {
    const defaultEntry: AbbreviationEntry = {
      shortcut: "STR",
      target: "Star wordserve-obsidian on github NOW!",
      created: Date.now(),
    };

    this.abbreviations = {
      STR: defaultEntry,
    };

    await this.saveAbbreviations();
  }

  private validateAbbreviationMap(data: any): data is AbbreviationMap {
    if (!data || typeof data !== "object") return false;

    for (const [value] of Object.entries(data)) {
      if (!this.validateAbbreviationEntry(value)) {
        return false;
      }
    }

    return true;
  }

  private validateAbbreviationEntry(entry: any): entry is AbbreviationEntry {
    return (
      entry &&
      typeof entry === "object" &&
      typeof entry.shortcut === "string" &&
      typeof entry.target === "string" &&
      typeof entry.created === "number" &&
      this.isValidShortcut(entry.shortcut) &&
      this.isValidTarget(entry.target)
    );
  }

  private isValidShortcut(shortcut: string): boolean {
    if (
      !shortcut ||
      shortcut.length === 0 ||
      shortcut.length > CONFIG.abbreviations.maxShortcutLength
    ) {
      return false;
    }

    const validPattern = /^[\p{L}\p{N}\p{P}\p{S}]+$/u;
    return validPattern.test(shortcut);
  }

  private isValidTarget(target: string): boolean {
    if (
      !target ||
      target.length === 0 ||
      target.length > CONFIG.abbreviations.maxTargetLength
    ) {
      return false;
    }

    return (
      !target.includes("\0") &&
      !target.includes("\x01") &&
      !target.includes("\x02")
    );
  }

  private async saveAbbreviations(): Promise<void> {
    try {
      // Use plugin data storage instead of direct file manipulation
      const currentData = await this.plugin.loadData() || {};
      currentData.abbreviations = this.abbreviations;
      await this.plugin.saveData(currentData);
      logger.abbrv("Abbreviations saved successfully to plugin data");
    } catch (error) {
      logger.abbrv("Error saving abbreviations", error);
    }
  }

  /** Finds an abbreviation by shortcut. */
  public findAbbreviation(text: string): AbbreviationEntry | null {
    const entry = this.abbreviations[text];
    return entry || null;
  }

  /** Adds a new abbreviation. */
  public async addAbbreviation(
    shortcut: string,
    target: string
  ): Promise<boolean> {
    if (!this.isValidShortcut(shortcut) || !this.isValidTarget(target)) {
      return false;
    }

    this.abbreviations[shortcut] = {
      shortcut,
      target,
      created: Date.now(),
    };
    await this.saveAbbreviations();
    return true;
  }

  /** Removes an abbreviation by shortcut. */
  public async removeAbbreviation(shortcut: string): Promise<boolean> {
    if (shortcut in this.abbreviations) {
      delete this.abbreviations[shortcut];
      await this.saveAbbreviations();
      return true;
    }
    return false;
  }

  /** Updates an existing abbreviation. */
  public async updateAbbreviation(
    oldShortcut: string,
    newShortcut: string,
    target: string
  ): Promise<boolean> {
    if (!this.isValidShortcut(newShortcut) || !this.isValidTarget(target)) {
      return false;
    }

    if (oldShortcut !== newShortcut && oldShortcut in this.abbreviations) {
      delete this.abbreviations[oldShortcut];
    }

    this.abbreviations[newShortcut] = {
      shortcut: newShortcut,
      target,
      created: this.abbreviations[oldShortcut]?.created || Date.now(),
    };
    await this.saveAbbreviations();
    return true;
  }

  /** Returns all stored abbreviations as an array. */
  public getAllAbbreviations(): AbbreviationEntry[] {
    return Object.values(this.abbreviations);
  }

  /** Searches abbreviations by shortcut text containing the query string. */
  public searchAbbreviations(query: string): AbbreviationEntry[] {
    const lowerQuery = query.toLowerCase();
    return Object.values(this.abbreviations).filter((entry) =>
      entry.shortcut.toLowerCase().includes(lowerQuery)
    );
  }

  /** Sorts abbreviation entries by creation date or alphabetically. */
  public sortAbbreviations(
    entries: AbbreviationEntry[],
    sortBy:
      | "newest"
      | "oldest"
      | "alphabetical-asc"
      | "alphabetical-desc" = "newest"
  ): AbbreviationEntry[] {
    const sorted = [...entries];

    switch (sortBy) {
      case "newest":
        return sorted.sort((a, b) => b.created - a.created);
      case "oldest":
        return sorted.sort((a, b) => a.created - b.created);
      case "alphabetical-asc":
        return sorted.sort((a, b) => a.shortcut.localeCompare(b.shortcut));
      case "alphabetical-desc":
        return sorted.sort((a, b) => b.shortcut.localeCompare(a.shortcut));
      default:
        return sorted;
    }
  }

  /** Checks if text at cursor position contains a valid abbreviation shortcut. */
  public checkForAbbreviation(
    text: string,
    cursorPos: number
  ): { abbreviation: AbbreviationEntry; start: number; end: number } | null {
    let start = cursorPos;

    while (
      start > 0 &&
      /[\p{L}\p{N}\p{P}\p{S}]/u.test(text.charAt(start - 1)) &&
      !/\s/.test(text.charAt(start - 1))
    ) {
      start--;
    }

    if (start === cursorPos) return null;

    const potentialShortcut = text.slice(start, cursorPos);

    if (potentialShortcut.includes(" ") || potentialShortcut.includes("\t")) {
      return null;
    }

    const abbreviation = this.findAbbreviation(potentialShortcut);

    if (abbreviation) {
      return {
        abbreviation,
        start,
        end: cursorPos,
      };
    }

    return null;
  }

  /** Expands a shortcut to its full text and optionally shows a notification. */
  public expandAbbreviation(
    shortcut: string,
    showNotification: boolean = false
  ): string | null {
    const abbreviation = this.findAbbreviation(shortcut);
    if (!abbreviation) return null;

    logger.abbrv(`Expanding abbreviation: ${shortcut} -> ${abbreviation.target}`);

    if (showNotification) {
      new Notice(`${shortcut} used as shortcut`);
    }
    return abbreviation.target;
  }
}
