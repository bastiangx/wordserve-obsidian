import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import TyperPlugin from "../../main";
import { CONFIG } from "../core/config";

export class TyperSettingTab extends PluginSettingTab {
  plugin: TyperPlugin;

  constructor(app: App, plugin: TyperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Minimum word length")
      .setDesc("Minimum number of characters before showing suggestions")
      .addSlider((slider) =>
        slider
          .setLimits(
            CONFIG.limits.minWordLength.min,
            CONFIG.limits.minWordLength.max,
            1
          )
          .setValue(this.plugin.settings.minWordLength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.minWordLength = value;
            this.plugin.suggestor.minChars = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Maximum suggestions")
      .setDesc("Maximum number of suggestions to show")
      .addSlider((slider) =>
        slider
          .setLimits(
            CONFIG.limits.maxSuggestions.min,
            CONFIG.limits.maxSuggestions.max,
            1
          )
          .setValue(this.plugin.settings.maxSuggestions)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxSuggestions = value;
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
            this.plugin.suggestor.numberSelectionEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Rankings Override")
      .setDesc("Always show suggestion rankings, even if digit selection is off.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRankingOverride)
          .onChange(async (value) => {
            this.plugin.settings.showRankingOverride = value;
            this.plugin.suggestor.showRankingOverride = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Debounce time")
      .setDesc("Time to wait after typing before showing suggestions menu")
      .addText((text) => {
        const min = CONFIG.limits.debounceTime.min;
        const max = CONFIG.limits.debounceTime.max;
        const defaultValue = CONFIG.plugin.debounceTime;
        text
          .setPlaceholder(`${min}-${max}ms`)
          .setValue(this.plugin.settings.debounceTime.toString());
        const inputEl = (text as any).inputEl as HTMLInputElement;
        inputEl.setAttribute("type", "number");
        inputEl.setAttribute("min", min.toString());
        inputEl.setAttribute("max", max.toString());
        inputEl.addEventListener("blur", async () => {
          const raw = inputEl.value.trim();
          let numValue = parseInt(raw);
          if (isNaN(numValue) || numValue < min || numValue > max) {
            new Notice(
              `Time must be between ${min} & ${max}. Reverting to default: ${defaultValue}.`
            );
            numValue = defaultValue;
          }
          this.plugin.settings.debounceTime = numValue;
          this.plugin.suggestor.debounceDelay = numValue;
          await this.plugin.saveSettings();
          text.setValue(numValue.toString());
        });
        return text;
      });

    new Setting(containerEl)
      .setName("Navigation mode")
      .setDesc("Keys used to choose an item in an opened menu (macos, vim, tabs)")
      .addDropdown((dropdown) => {
        CONFIG.keybind_modes.available.forEach((mode: string) => {
          dropdown.addOption(mode, mode.charAt(0).toUpperCase() + mode.slice(1));
        });
        dropdown.setValue((this.plugin.settings.keybindMode || CONFIG.keybind_modes.default) as any);
        dropdown.onChange(async (value) => {
          this.plugin.settings.keybindMode = value as any;
          // @ts-ignore
          import("../settings/keybinds").then(({ keybindManager }) => {
            keybindManager.setMode(value as any);
          });
          await this.plugin.saveSettings();
        });
      });
  }
}