import { Plugin } from "obsidian";
import { TyperClient } from "./src/core/client";
import {  TyperSuggest } from "./src/ui/render";
import { DEFAULT_SETTINGS } from "./src/core/config";
import { TyperPluginSettings } from "./src/models/types";
import { TyperSettingTab } from "src/settings/tab";

export default class TyperPlugin extends Plugin {
  settings: TyperPluginSettings;
  ipc: TyperClient;
  suggestor: TyperSuggest;
  statusBarEl: HTMLElement;

  async onload() {
    await this.loadSettings();

    const updateSuggestorSettings = () => {
      this.suggestor.minChars = this.settings.minWordLength;
      this.suggestor.limit = this.settings.maxSuggestions;
      this.suggestor.fuzzyMatching = this.settings.fuzzyMatching;
      this.suggestor.numberSelectionEnabled = this.settings.numberSelection;
      this.suggestor.debounceDelay = this.settings.debounceTime;
    };

    this.ipc = new TyperClient(this);
    this.suggestor = new TyperSuggest(this.app, this.ipc);

    updateSuggestorSettings();
    this.registerEditorSuggest(this.suggestor);

    // statusBar shows current status
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("Typer: Ready");

    this.addSettingTab(new TyperSettingTab(this.app, this));

    this.ipc
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
    this.ipc.cleanup();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
