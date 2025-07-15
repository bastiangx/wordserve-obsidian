import { Extension } from "@codemirror/state";
import { Plugin } from "obsidian";
import { WordServeClient } from "./src/core/client";
import { WordServeSuggest } from "./src/ui/render";
import { DEFAULT_SETTINGS } from "./src/core/config";
import { WordServePluginSettings } from "./src/types";
import { WordServeSettingTab } from "src/settings/tab";
import { logger } from "./src/utils/logger";
import { hotkeyCmd } from "./src/commands/hotkeys";
import { ghostTextState } from "./src/editor/ghost-text-extension";

/** Main plugin class that coordinates text suggestions & abbreviations */
export default class WordServePlugin extends Plugin {
  settings: WordServePluginSettings;
  client: WordServeClient;
  suggestor: WordServeSuggest;
  statusBarEl: HTMLElement;
  editorExtensions: Extension[] = [];

  async onload() {
    logger.info("Plugin loading started");
    await this.loadSettings();

    this.registerEditorExtension(this.editorExtensions);
    this.updateEditorExtensions();

    const updateSuggestorSettings = () => {
      this.suggestor.minChars = this.settings.minWordLength;
      this.suggestor.limit = Math.max(1, this.settings.maxSuggestions || 20);
      this.suggestor.numberSelectionEnabled = this.settings.numberSelection;
      this.suggestor.debounceDelay = this.settings.debounceTime;
      this.suggestor.showRankingOverride = this.settings.showRankingOverride;
      this.suggestor.smartBackspace = this.settings.smartBackspace;
    };

    this.client = new WordServeClient(this);
    this.suggestor = new WordServeSuggest(this.app, this.client, this);

    updateSuggestorSettings();
    this.registerEditorSuggest(this.suggestor);

    // For DBG mode only
    if (this.settings.debugMode) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.setText("WordServe: Ready");
    }

    this.addSettingTab(new WordServeSettingTab(this.app, this));

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
            this.statusBarEl.setText("WordServe: Active");
          } else {
            this.statusBarEl.setText("WordServe: Inactive");
          }
        }
        logger.debug(
          `WordServe loaded successfully - Core connection: ${isReady ? "Active" : "Inactive"
          }`
        );
      })
      .catch((error) => {
        if (this.settings.debugMode && this.statusBarEl) {
          this.statusBarEl.setText("WordServe: Error");
        }
        logger.error("--FATAL-- WordServe failed to initialize", error);
      });
  }

  onunload() {
    this.suggestor?.cleanup();
    this.client.cleanup();
  }

  /** Loads plugin settings from storage and initializes logger configuration. */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    
    // Validate and fix critical settings
    if (!this.settings.maxSuggestions || this.settings.maxSuggestions <= 0) {
      logger.warn(`Invalid maxSuggestions value: ${this.settings.maxSuggestions}, resetting to default: 20`);
      this.settings.maxSuggestions = 20;
    }
    
    if (!this.settings.minWordLength || this.settings.minWordLength <= 0) {
      logger.warn(`Invalid minWordLength value: ${this.settings.minWordLength}, resetting to default: 3`);
      this.settings.minWordLength = 3;
    }
    
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

    body.toggleClass("wordserve-compact-mode", this.settings.compactMode);

    body.removeClass(
      "wordserve-font-smallest",
      "wordserve-font-smaller",
      "wordserve-font-small",
      "wordserve-font-editor",
      "wordserve-font-ui-small",
      "wordserve-font-ui-medium",
      "wordserve-font-ui-larger"
    );
    body.addClass(`wordserve-font-${this.settings.fontSize}`);

    // Font weight classes
    body.removeClass(
      "wordserve-weight-thin",
      "wordserve-weight-extralight",
      "wordserve-weight-light",
      "wordserve-weight-normal",
      "wordserve-weight-medium",
      "wordserve-weight-semibold",
      "wordserve-weight-bold",
      "wordserve-weight-extrabold",
      "wordserve-weight-black"
    );
    body.addClass(`wordserve-weight-${this.settings.fontWeight}`);

    body.toggleClass(
      "wordserve-bold-suffix",
      this.settings.accessibility.boldSuffix
    );
    body.toggleClass(
      "wordserve-uppercase",
      this.settings.accessibility.uppercaseSuggestions
    );

    body.removeClass(
      "wordserve-prefix-normal",
      "wordserve-prefix-muted",
      "wordserve-prefix-faint",
      "wordserve-prefix-accent"
    );
    body.addClass(
      `wordserve-prefix-${this.settings.accessibility.prefixColorIntensity}`
    );

    body.removeClass(
      "wordserve-ghost-normal",
      "wordserve-ghost-muted",
      "wordserve-ghost-faint",
      "wordserve-ghost-accent"
    );
    body.addClass(
      `wordserve-ghost-${this.settings.accessibility.ghostTextColorIntensity}`
    );
  }

  /** Shows or hides the debug status bar based on debug mode setting. */
  updateDebugStatusBar(): void {
    if (this.settings.debugMode) {
      if (!this.statusBarEl) {
        this.statusBarEl = this.addStatusBarItem();
        this.statusBarEl.setText("WordServe: Ready");
      }
    } else {
      if (this.statusBarEl) {
        this.statusBarEl.remove();
        this.statusBarEl = null as any;
      }
    }
  }
}
