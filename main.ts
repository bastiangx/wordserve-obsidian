import { Plugin } from "obsidian";
import { TyperClient } from "./src/core/client";
import {  TyperSuggest } from "./src/ui/render";
import { DEFAULT_SETTINGS } from "./src/core/config";
import { TyperPluginSettings } from "./src/types";
import { TyperSettingTab } from "src/settings/tab";

export default class TyperPlugin extends Plugin {
  settings: TyperPluginSettings;
  client: TyperClient;
  suggestor: TyperSuggest;
  statusBarEl: HTMLElement;

  async onload() {
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
    this.suggestor = new TyperSuggest(this.app, this.client);

    updateSuggestorSettings();
    this.registerEditorSuggest(this.suggestor);

    // Shows simply current status 
    // TODO: rework this to something more useful
    // TODO: default it should be turned off, or used for dbg mode
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("Typer: Ready");

    this.addSettingTab(new TyperSettingTab(this.app, this));

    this.client
      .initialize()
      .then((isReady) => {
        if (isReady) {
          this.statusBarEl.setText("Typer: Active");
        } else {
          this.statusBarEl.setText("Typer: Inactive");
        }
      })
      .catch(() => {
        this.statusBarEl.setText("Typer: Error");
      });
  }

  onunload() {
    this.client.cleanup();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
