import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { TyprIPC } from "./src/typr-ipc";
import { TyprSuggest } from "./src/typr-suggest";
import { CONFIG } from "./src/config";

/**
 * User settings that can be changed in the settings tab
 */
interface TyprPluginSettings {
  minWordLength: number;
  maxSuggestions: number;
  fuzzyMatching: boolean;
  debounceTime: number;
  numberSelection: boolean;
}

/**
 * Default settings derived from centralized CONFIG
 */
const DEFAULT_SETTINGS: TyprPluginSettings = {
  minWordLength: CONFIG.plugin.minWordLength,
  maxSuggestions: CONFIG.plugin.maxSuggestions,
  fuzzyMatching: CONFIG.plugin.fuzzyMatching,
  debounceTime: CONFIG.plugin.debounceTime,
  numberSelection: CONFIG.plugin.numberSelection,
};

export default class TyprPlugin extends Plugin {
  settings: TyprPluginSettings;
  ipc: TyprIPC;
  suggestor: TyprSuggest;
  statusBarEl: HTMLElement;

  async onload() {
    await this.loadSettings();

    // Update the suggestor settings when plugin settings change
    const updateSuggestorSettings = () => {
      this.suggestor.minChars = this.settings.minWordLength;
      this.suggestor.limit = this.settings.maxSuggestions;
      this.suggestor.fuzzyMatching = this.settings.fuzzyMatching;
      this.suggestor.numberSelectionEnabled = this.settings.numberSelection;
      this.suggestor.debounceDelay = this.settings.debounceTime;
    };

    // Initialize the IPC connection to backend
    this.ipc = new TyprIPC(this);

    // Create the suggestor
    this.suggestor = new TyprSuggest(this.app, this.ipc);

    // Apply initial settings to suggestor
    updateSuggestorSettings();

    // Register the suggest functionality
    this.registerEditorSuggest(this.suggestor);

    // Create an icon in the left ribbon
    this.addRibbonIcon(
      "keyboard",
      "Typr Autocompletion",
      async (evt: MouseEvent) => {
        // Test the connection to backend
        try {
          const isReady = await this.ipc.initialize();
          if (isReady) {
            new Notice("Typr autocompletion is ready and connected");
          } else {
            new Notice("Failed to connect to Typr backend");
          }
        } catch (error) {
          new Notice("Failed to initialize Typr: " + error);
        }
      }
    );

    // Add a status bar item
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("Typr: Ready");

    // Add a command to force-enable autocompletion
    this.addCommand({
      id: "force-enable-typr",
      name: "Enable Typr autocompletion",
      callback: async () => {
        try {
          const isReady = await this.ipc.initialize();
          if (isReady) {
            new Notice("Typr autocompletion enabled");
            this.statusBarEl.setText("Typr: Active");
          } else {
            new Notice("Failed to enable Typr");
            this.statusBarEl.setText("Typr: Error");
          }
        } catch (error) {
          new Notice("Failed to initialize Typr: " + error);
          this.statusBarEl.setText("Typr: Error");
        }
      },
    });

    // Add a settings tab
    this.addSettingTab(new TyprSettingTab(this.app, this));

    // Initialize the connection
    this.ipc
      .initialize()
      .then((isReady) => {
        if (isReady) {
          this.statusBarEl.setText("Typr: Active");
        } else {
          this.statusBarEl.setText("Typr: Inactive");
        }
      })
      .catch(() => {
        this.statusBarEl.setText("Typr: Error");
      });
  }

  onunload() {
    this.ipc.cleanup();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class TyprSettingTab extends PluginSettingTab {
  plugin: TyprPlugin;

  constructor(app: App, plugin: TyprPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Typr Autocompletion Settings" });

    new Setting(containerEl)
      .setName("Minimum word length")
      .setDesc("Minimum number of characters before showing suggestions")
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.minWordLength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.minWordLength = value;
            // Update suggestor
            this.plugin.suggestor.minChars = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Maximum suggestions")
      .setDesc("Maximum number of suggestions to show")
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.maxSuggestions)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxSuggestions = value;
            // Update suggestor
            this.plugin.suggestor.limit = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Fuzzy matching")
      .setDesc("Use fuzzy matching for suggestions")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.fuzzyMatching)
          .onChange(async (value) => {
            this.plugin.settings.fuzzyMatching = value;
            // Update suggestor
            this.plugin.suggestor.fuzzyMatching = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Digit selection")
      .setDesc("Allow faster selection via pressing digit keys")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.numberSelection)
          .onChange(async (value) => {
            this.plugin.settings.numberSelection = value;
            // Update suggestor
            this.plugin.suggestor.numberSelectionEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Debounce time")
      .setDesc(
        "Time in milliseconds to wait after typing before showing suggestions"
      )
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 10)
          .setValue(this.plugin.settings.debounceTime)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.debounceTime = value;
            // Update suggestor
            this.plugin.suggestor.debounceDelay = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
