import { Plugin } from "obsidian";
import { TyperClient } from "./src/core/client";
import {  TyperSuggest } from "./src/ui/render";
import { DEFAULT_SETTINGS } from "./src/core/config";
import { TyperPluginSettings } from "./src/types";
import { TyperSettingTab } from "src/settings/tab";
import { logger } from "./src/utils/logger";

export default class TyperPlugin extends Plugin {
  settings: TyperPluginSettings;
  client: TyperClient;
  suggestor: TyperSuggest;
  statusBarEl: HTMLElement;

  async onload() {
    logger.info("Plugin loading started");
    await this.loadSettings();

    const updateSuggestorSettings = () => {
      this.suggestor.minChars = this.settings.minWordLength;
      this.suggestor.limit = this.settings.maxSuggestions;
      this.suggestor.numberSelectionEnabled = this.settings.numberSelection;
      this.suggestor.debounceDelay = this.settings.debounceTime;
      this.suggestor.showRankingOverride = this.settings.showRankingOverride;
      // only sets if user overrides binds
      if (this.settings.keybindMode) {
        import("./src/settings/keybinds").then(({ keybindManager }) => {
          keybindManager.setMode(this.settings.keybindMode!);
        });
      }
    };

    this.client = new TyperClient(this);
    this.suggestor = new TyperSuggest(this.app, this.client, this);

    updateSuggestorSettings();
    this.registerEditorSuggest(this.suggestor);

    // Status bar only visible in debug mode
    if (this.settings.debugMode) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.setText("Typer: Ready");
    }

    this.addSettingTab(new TyperSettingTab(this.app, this));
    
    // Initialize body classes for accessibility and rendering options
    this.updateBodyClasses();

    this.client
      .initialize()
      .then((isReady) => {
        if (this.settings.debugMode && this.statusBarEl) {
          if (isReady) {
            this.statusBarEl.setText("Typer: Active");
          } else {
            this.statusBarEl.setText("Typer: Inactive");
          }
        }
        logger.info(`Plugin loaded successfully - Core connection: ${isReady ? 'Active' : 'Inactive'}`);
      })
      .catch((error) => {
        if (this.settings.debugMode && this.statusBarEl) {
          this.statusBarEl.setText("Typer: Error");
        }
        logger.error("Plugin failed to initialize", error);
      });
  }

  onunload() {
    this.client.cleanup();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    logger.setDebugMode(this.settings.debugMode);
    logger.setDebugSettings(this.settings.debug);
    logger.config("Settings loaded", { 
      debugMode: this.settings.debugMode,
      minWordLength: this.settings.minWordLength,
      maxSuggestions: this.settings.maxSuggestions,
      debugOptions: this.settings.debug
    });
  }

  async saveSettings() {
    logger.config("Saving settings", this.settings);
    await this.saveData(this.settings);
  }

  updateBodyClasses(): void {
    const body = document.body;
    
    logger.config("Updating body classes", {
      compactMode: this.settings.compactMode,
      fontSize: this.settings.fontSize,
      fontWeight: this.settings.fontWeight,
      accessibility: this.settings.accessibility
    });
    
    // Compact mode
    body.toggleClass("typer-compact-mode", this.settings.compactMode);
    
    // Font size classes
    body.removeClass("typer-font-smallest", "typer-font-smaller", "typer-font-small", "typer-font-editor", "typer-font-ui-small", "typer-font-ui-medium", "typer-font-ui-larger");
    body.addClass(`typer-font-${this.settings.fontSize}`);
    
    // Font weight classes
    body.removeClass("typer-weight-thin", "typer-weight-extralight", "typer-weight-light", "typer-weight-normal", "typer-weight-medium", "typer-weight-semibold", "typer-weight-bold", "typer-weight-extrabold", "typer-weight-black");
    body.addClass(`typer-weight-${this.settings.fontWeight}`);
    
    // Accessibility classes
    body.toggleClass("typer-bold-suffix", this.settings.accessibility.boldSuffix);
    body.toggleClass("typer-uppercase", this.settings.accessibility.uppercaseSuggestions);
    
    // Prefix color intensity
    body.removeClass("typer-prefix-normal", "typer-prefix-muted", "typer-prefix-faint", "typer-prefix-accent");
    body.addClass(`typer-prefix-${this.settings.accessibility.prefixColorIntensity}`);
  }

  updateDebugStatusBar(): void {
    if (this.settings.debugMode) {
      if (!this.statusBarEl) {
        this.statusBarEl = this.addStatusBarItem();
        this.statusBarEl.setText("Typer: Ready");
      }
    } else {
      if (this.statusBarEl) {
        this.statusBarEl.remove();
        this.statusBarEl = null as any;
      }
    }
  }
}
