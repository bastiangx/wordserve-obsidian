import { Extension } from "@codemirror/state";
import { Plugin } from "obsidian";
import { TyperClient } from "./src/core/client";
import { TyperSuggest } from "./src/ui/render";
import { DEFAULT_SETTINGS } from "./src/core/config";
import { TyperPluginSettings } from "./src/types";
import { TyperSettingTab } from "src/settings/tab";
import { logger } from "./src/utils/logger";
import { hotkeyCmd } from "./src/commands/hotkeys";
import { ghostTextState } from "./src/editor/ghost-text-extension";

/** Main plugin class that coordinates text suggestions & abbreviations */
export default class TyperPlugin extends Plugin {
  settings: TyperPluginSettings;
  client: TyperClient;
  suggestor: TyperSuggest;
  statusBarEl: HTMLElement;
  editorExtensions: Extension[] = [];

  async onload() {
    logger.info("Plugin loading started");
    await this.loadSettings();

    this.registerEditorExtension(this.editorExtensions);
    this.updateEditorExtensions();

    const updateSuggestorSettings = () => {
      this.suggestor.minChars = this.settings.minWordLength;
      this.suggestor.limit = this.settings.maxSuggestions;
      this.suggestor.numberSelectionEnabled = this.settings.numberSelection;
      this.suggestor.debounceDelay = this.settings.debounceTime;
      this.suggestor.showRankingOverride = this.settings.showRankingOverride;
      this.suggestor.smartBackspace = this.settings.smartBackspace;
    };

    this.client = new TyperClient(this);
    this.suggestor = new TyperSuggest(this.app, this.client, this);

    updateSuggestorSettings();
    this.registerEditorSuggest(this.suggestor);

    // For DBG mode only
    if (this.settings.debugMode) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.setText("Typer: Ready");
    }

    this.addSettingTab(new TyperSettingTab(this.app, this));

    // Set in obsidian's native binder
    const hotkeyCommands = hotkeyCmd(this);
    hotkeyCommands.forEach((command) => {
      this.addCommand(command);
    });

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
        logger.debug(
          `Typer loaded successfully - Core connection: ${isReady ? "Active" : "Inactive"
          }`
        );
      })
      .catch((error) => {
        if (this.settings.debugMode && this.statusBarEl) {
          this.statusBarEl.setText("Typer: Error");
        }
        logger.error("--FATAL-- Typer failed to initialize", error);
      });
  }

  onunload() {
    this.client.cleanup();
  }

  /** Loads plugin settings from storage and initializes logger configuration. */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    logger.setDebugMode(this.settings.debugMode);
    logger.setDebugSettings(this.settings.debug);
    logger.config("Settings loaded", {
      debugMode: this.settings.debugMode,
      minWordLength: this.settings.minWordLength,
      maxSuggestions: this.settings.maxSuggestions,
      debugOptions: this.settings.debug,
    });
  }

  /** Saves current settings to storage and updates various configurations. */
  async saveSettings() {
    logger.config("Saving settings", this.settings);
    await this.saveData(this.settings);
    this.updateEditorExtensions();
    this.updateBodyClasses();
    
    // Update auto-respawn configuration
    this.client.updateAutoRespawnConfig(this.settings.autorespawn);
  }

  /** Updates the CodeMirror editor extensions for the plugin. */
  updateEditorExtensions(): void {
    this.editorExtensions.length = 0;
    this.editorExtensions.push(ghostTextState);
    this.app.workspace.updateOptions();
  }

  /** Updates CSS classes on the document body based on plugin settings. */
  updateBodyClasses(): void {
    const body = document.body;

    logger.config("Updating body classes", {
      compactMode: this.settings.compactMode,
      fontSize: this.settings.fontSize,
      fontWeight: this.settings.fontWeight,
      accessibility: this.settings.accessibility,
    });

    body.toggleClass("typer-compact-mode", this.settings.compactMode);

    body.removeClass(
      "typer-font-smallest",
      "typer-font-smaller",
      "typer-font-small",
      "typer-font-editor",
      "typer-font-ui-small",
      "typer-font-ui-medium",
      "typer-font-ui-larger"
    );
    body.addClass(`typer-font-${this.settings.fontSize}`);

    // Font weight classes
    body.removeClass(
      "typer-weight-thin",
      "typer-weight-extralight",
      "typer-weight-light",
      "typer-weight-normal",
      "typer-weight-medium",
      "typer-weight-semibold",
      "typer-weight-bold",
      "typer-weight-extrabold",
      "typer-weight-black"
    );
    body.addClass(`typer-weight-${this.settings.fontWeight}`);

    body.toggleClass(
      "typer-bold-suffix",
      this.settings.accessibility.boldSuffix
    );
    body.toggleClass(
      "typer-uppercase",
      this.settings.accessibility.uppercaseSuggestions
    );

    body.removeClass(
      "typer-prefix-normal",
      "typer-prefix-muted",
      "typer-prefix-faint",
      "typer-prefix-accent"
    );
    body.addClass(
      `typer-prefix-${this.settings.accessibility.prefixColorIntensity}`
    );

    body.removeClass(
      "typer-ghost-normal",
      "typer-ghost-muted",
      "typer-ghost-faint",
      "typer-ghost-accent"
    );
    body.addClass(
      `typer-ghost-${this.settings.accessibility.ghostTextColorIntensity}`
    );
  }

  /** Shows or hides the debug status bar based on debug mode setting. */
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
