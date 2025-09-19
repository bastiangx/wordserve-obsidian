import { App, Notice, PluginSettingTab, Setting, Modal } from "obsidian";
import WordServePlugin from "../../main";
import { CONFIG } from "../core/config";
import { AbbreviationDialog } from "../rendering/abbrv-modal";
import { logger } from "../utils/logger";
import { keybindManager } from "./keybinds";

/** Settings tab interface for configuring WordServe plugin behavior and preferences. */
export class WordServeSettingTab extends PluginSettingTab {
  plugin: WordServePlugin;

  constructor(app: App, plugin: WordServePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    await this.renderSettings(containerEl);
  }

  hide(): void {
    super.hide();
  }

  private async renderSettings(containerEl: HTMLElement): Promise<void> {
    new Setting(containerEl).setName("Behavior").setHeading();

    new Setting(containerEl)
      .setName("Smart backspace")
      .setDesc(
        "Restore the original word when pressing backspace after a suggestion is accepted"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.smartBackspace)
          .onChange(async (value) => {
            this.plugin.settings.smartBackspace = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Minimum length")
      .setDesc("Number of typed characters before showing suggestions")
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
            const oldValue = this.plugin.settings.minWordLength;
            this.plugin.settings.minWordLength = value;
            this.plugin.suggestor.minChars = value;

            const success = await this.plugin.client.updateConfigFile({
              minPrefix: value,
            });

            if (success) {
              await this.plugin.client.restart();
            }

            logger.config("Min word length changed", {
              from: oldValue,
              to: value,
              tomlUpdated: success,
            });
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Maximum suggestions")
      .setDesc("Number of suggestions to show")
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
            const oldValue = this.plugin.settings.maxSuggestions;
            const validValue = Math.max(1, Math.min(180, value)); // Ensure value is between 1 and 180

            if (validValue !== value) {
              logger.warn(
                `Invalid maxSuggestions value: ${value}, using: ${validValue}`
              );
            }

            this.plugin.settings.maxSuggestions = validValue;
            this.plugin.suggestor.limit = validValue;

            // Update TOML config file for core
            const success = await this.plugin.client.updateConfigFile({
              maxSuggestions: value,
            });

            if (success) {
              // Restart the backend to pick up new config
              await this.plugin.client.restart();
            }

            logger.config("Max suggestions changed", {
              from: oldValue,
              to: validValue,
              tomlUpdated: success,
            });
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Digit selection")
      .setDesc("Faster selection via pressing the number keys [1-9]")
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
      .setDesc("Show rankings, even if digit selection is OFF.")
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
      .setDesc("Time to wait after typing to see suggestions")
      .setTooltip("Enter a number between 1 and 2000 milliseconds")
      .addText((text) => {
        const min = CONFIG.limits.debounceTime.min;
        const max = CONFIG.limits.debounceTime.max;
        const defaultValue = CONFIG.plugin.debounceTime;
        text
          .setPlaceholder(`${min}-${max}ms`)
          .setValue(this.plugin.settings.debounceTime.toString());
        const inputEl = text.inputEl;
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

    // Keybinds Section
    new Setting(containerEl).setName("Keybinds").setHeading();

    new Setting(containerEl)
      .setName("Accept suggestion")
      .setDesc("Insert WITHOUT adding space")
      .addDropdown((dropdown) => {
        dropdown.addOption("Enter", "Enter");
        dropdown.addOption("Tab", "Tab");
        dropdown.setValue(CONFIG.keybinds.select[0] || "Enter");
        dropdown.onChange(async (value) => {
          keybindManager.overrideKeybind("select", [value]);
          this.plugin.suggestor.updateKeybinds();
        });
      });

    new Setting(containerEl)
      .setName("Accept suggestion with space")
      .setDesc("Insert WITH added space")
      .addDropdown((dropdown) => {
        dropdown.addOption("Tab", "Tab");
        dropdown.addOption("Enter", "Enter");
        dropdown.setValue(CONFIG.keybinds.select_and_space[0] || "Tab");
        dropdown.onChange(async (value) => {
          keybindManager.overrideKeybind("select_and_space", [value]);
          this.plugin.suggestor.updateKeybinds();
        });
      });

    // Shortucts Section
    new Setting(containerEl).setName("Shortcuts & abbreviations").setHeading();

    new Setting(containerEl)
      .setName("Abbreviations")
      .setDesc("Text expansion functionality")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.abbreviationsEnabled)
          .onChange(async (value) => {
            this.plugin.settings.abbreviationsEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Abbreviation notifications")
      .setDesc("When shortcuts are expanded")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.abbreviationNotification)
          .onChange(async (value) => {
            this.plugin.settings.abbreviationNotification = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Manage shortcuts")
      .setDesc("View and change your abbreviations list")
      .addButton((button) =>
        button
          .setButtonText("Edit")
          .setCta()
          .onClick(() => {
            const dialog = new AbbreviationDialog(
              this.app,
              this.plugin,
              this.plugin.suggestor.abbreviationManager
            );
            dialog.open();
          })
      );

    // Rendering Section
    new Setting(containerEl).setName("Rendering").setHeading();

    new Setting(containerEl)
      .setName("Compact")
      .setDesc("UI with smaller paddings and margins")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.compactMode)
          .onChange(async (value) => {
            this.plugin.settings.compactMode = value;
            this.updateBodyClasses();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ghost text")
      .setDesc("Show text preview while typing")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ghostTextEnabled)
          .onChange(async (value) => {
            this.plugin.settings.ghostTextEnabled = value;
            if (!value) {
              this.plugin.suggestor.clearAllGhostText();
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Font size")
      .setDesc("Suggestion text (in-menu)")
      .addDropdown((dropdown) => {
        dropdown.addOption("smallest", "Text Smallest (0.8em)");
        dropdown.addOption("smaller", "Text Smaller (0.875em)");
        dropdown.addOption("small", "Text Small (0.933em)");
        dropdown.addOption("editor", "Default");
        dropdown.addOption("ui-small", "UI Small (13px)");
        dropdown.addOption("ui-medium", "UI Medium (15px)");
        dropdown.addOption("ui-larger", "UI Larger (20px)");
        dropdown.setValue(this.plugin.settings.fontSize);
        dropdown.onChange(
          async (
            value:
              | "smallest"
              | "smaller"
              | "small"
              | "editor"
              | "ui-small"
              | "ui-medium"
              | "ui-larger"
          ) => {
            this.plugin.settings.fontSize = value;
            this.loadFontSizeTheme();
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("Font weight")
      .setDesc("Font weight for suggestion text")
      .addDropdown((dropdown) => {
        dropdown.addOption("thin", "100");
        dropdown.addOption("extralight", "200");
        dropdown.addOption("light", "300");
        dropdown.addOption("normal", "400");
        dropdown.addOption("medium", "500");
        dropdown.addOption("semibold", "600");
        dropdown.addOption("bold", "700");
        dropdown.addOption("extrabold", "800");
        dropdown.addOption("black", "900");
        dropdown.setValue(this.plugin.settings.fontWeight);
        dropdown.onChange(
          async (
            value:
              | "thin"
              | "extralight"
              | "light"
              | "normal"
              | "medium"
              | "semibold"
              | "bold"
              | "extrabold"
              | "black"
          ) => {
            this.plugin.settings.fontWeight = value;
            this.loadFontWeightTheme();
            await this.plugin.saveSettings();
          }
        );
      });

    // Dictionary Section
    new Setting(containerEl).setName("Dictionary").setHeading();

    await this.addDictionarySizeSetting(containerEl);

    // Accessibility Section
    new Setting(containerEl).setName("Accessibility").setHeading();

    new Setting(containerEl)
      .setName("Bold suffix")
      .setDesc("Makes the suffix of suggestions bold")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.accessibility.boldSuffix)
          .onChange(async (value) => {
            this.plugin.settings.accessibility.boldSuffix = value;
            this.updateBodyClasses();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("All uppercase")
      .setDesc("Suggestions will be in UPPERCASE")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.accessibility.uppercaseSuggestions)
          .onChange(async (value) => {
            this.plugin.settings.accessibility.uppercaseSuggestions = value;
            this.updateBodyClasses();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ghost text color")
      .setDesc("(in-editor) color - will depend on your applied theme")
      .addDropdown((dropdown) => {
        dropdown.addOption("normal", "Normal");
        dropdown.addOption("accent", "Accent");
        dropdown.addOption("muted", "Muted");
        dropdown.addOption("faint", "Faint");
        dropdown.setValue(
          this.plugin.settings.accessibility.ghostTextColorIntensity
        );
        dropdown.onChange(
          async (value: "normal" | "muted" | "faint" | "accent") => {
            this.plugin.settings.accessibility.ghostTextColorIntensity = value;
            this.updateBodyClasses();
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("Prefix color")
      .setDesc("(in-menu) color - will depend on your applied theme")
      .addDropdown((dropdown) => {
        dropdown.addOption("normal", "Normal");
        dropdown.addOption("accent", "Accent");
        dropdown.addOption("muted", "Muted");
        dropdown.addOption("faint", "Faint");
        dropdown.setValue(
          this.plugin.settings.accessibility.prefixColorIntensity
        );
        dropdown.onChange(
          async (value: "normal" | "muted" | "faint" | "accent") => {
            this.plugin.settings.accessibility.prefixColorIntensity = value;
            this.updateBodyClasses();
            await this.plugin.saveSettings();
          }
        );
      });

    // Debug Section
    new Setting(containerEl).setName("Debugging").setHeading();

    this.createDebugEventsSection(containerEl);
  }

  private updateBodyClasses(): void {
    const body = document.body;

    // Compact mode
    body.toggleClass(
      "wordserve-compact-mode",
      this.plugin.settings.compactMode
    );

    // Font size classes
    body.removeClass(
      "wordserve-font-smallest",
      "wordserve-font-smaller",
      "wordserve-font-small",
      "wordserve-font-editor",
      "wordserve-font-ui-small",
      "wordserve-font-ui-medium",
      "wordserve-font-ui-larger"
    );
    body.addClass(`wordserve-font-${this.plugin.settings.fontSize}`);

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
    body.addClass(`wordserve-weight-${this.plugin.settings.fontWeight}`);

    // Accessibility classes
    body.toggleClass(
      "wordserve-bold-suffix",
      this.plugin.settings.accessibility.boldSuffix
    );
    body.toggleClass(
      "wordserve-uppercase",
      this.plugin.settings.accessibility.uppercaseSuggestions
    );

    // Prefix color intensity
    body.removeClass(
      "wordserve-prefix-normal",
      "wordserve-prefix-muted",
      "wordserve-prefix-faint",
      "wordserve-prefix-accent"
    );
    body.addClass(
      `wordserve-prefix-${this.plugin.settings.accessibility.prefixColorIntensity}`
    );

    // Ghost text color intensity
    body.removeClass(
      "wordserve-ghost-normal",
      "wordserve-ghost-muted",
      "wordserve-ghost-faint",
      "wordserve-ghost-accent"
    );
    const ghostClass = `wordserve-ghost-${this.plugin.settings.accessibility.ghostTextColorIntensity}`;
    body.addClass(ghostClass);
  }

  private createDebugEventsSection(containerEl: HTMLElement): void {
    // Create collapsible debug events section
    const debugEventsDetails = containerEl.createEl("details", {
      cls: "typer-debug-events",
    });

    const debugContent = debugEventsDetails.createEl("div", {
      cls: "typer-debug-content",
    });

    // Error log actions (copy/clear)
    new Setting(debugContent)
      .setName("Error logs")
      .setDesc("Useful for troubleshooting and sharing issues")
      .addButton((button) =>
        button.setButtonText("Copy logs").onClick(async () => {
          try {
            const tomlText = (await logger.readErrorLog()) || "";
            if (!tomlText.trim()) {
              new Notice("No logs found");
              return;
            }
            const copied = await this.copyTextToClipboard(tomlText);
            if (copied) {
              new Notice("Error logs copied to clipboard");
            } else {
              new Notice("Failed to copy error logs");
            }
          } catch (error) {
            logger.error("Failed to copy error logs:", error);
            new Notice("Failed to copy error logs");
          }
        })
      )
      .addButton((button) =>
        button.setButtonText("Clear logs").onClick(async () => {
          try {
            await logger.clearErrorLog();
            new Notice("Logs cleared");
          } catch (error) {
            logger.error("Failed to clear error logs:", error);
            new Notice("Failed to clear error logs");
          }
        })
      );

    // Auto-respawn status display
    const autoRespawnStats = this.plugin.client.getAutoRespawnStats();
    new Setting(debugContent)
      .setName("Auto-respawn status")
      .setDesc(
        `Requests: ${autoRespawnStats.requestCount}/${this.plugin.settings.autorespawn.requestThreshold} | Time: ${autoRespawnStats.minutesSinceLastRespawn}/${this.plugin.settings.autorespawn.timeThresholdMinutes} min`
      )
      .setClass("typer-stats-display");

    new Setting(debugContent)
      .setName("Auto-respawn")
      .setDesc(
        "Automatically restart the spawned process. Disabling this may cause issues"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autorespawn.enabled)
          .onChange(async (value) => {
            if (!value) {
              const modal = new AutoRespawnWarningModal(
                this.app,
                async () => {
                  this.plugin.settings.autorespawn.enabled = false;
                  await this.plugin.saveSettings();
                  toggle.setValue(false);
                },
                () => {
                  toggle.setValue(true);
                }
              );
              modal.open();
            } else {
              this.plugin.settings.autorespawn.enabled = true;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(debugContent)
      .setName("Force rebuild core")
      .setDesc(
        "Restarts WordServe's core process. Use this ONLY if you encounter unrecoverable errors or want a fresh start without disabling the plugin."
      )
      .addButton((button) =>
        button
          .setButtonText("Rebuild")
          .setCta()
          .setClass("mod-warning")
          .onClick(async () => {
            button.setButtonText("Rebuilding...");
            button.setDisabled(true);

            try {
              const success = await this.plugin.client.restart();
              if (success) {
                new Notice("Typer process rebuilt successfully");
                button.setButtonText("Rebuild");
              } else {
                new Notice("Failed to rebuild typer process");
                button.setButtonText("Rebuild (Failed)");
                setTimeout(() => button.setButtonText("Rebuild"), 3000);
              }
            } catch (error) {
              logger.error("Failed to rebuild typer process:", error);
              new Notice("Error rebuilding typer process");
              button.setButtonText("Rebuild (Error)");
              setTimeout(() => button.setButtonText("Rebuild"), 3000);
            } finally {
              button.setDisabled(false);
            }
          })
      );
  }

  private async copyTextToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    return false;
  }

  private async addDictionarySizeSetting(
    containerEl: HTMLElement
  ): Promise<void> {
    const currentSize = this.plugin.settings.dictionarySize;
    const maxChunks = await this.getAvailableDictionaryFiles();

    new Setting(containerEl)
      .setName("Size")
      .setDesc(
        "Number of words to load. Higher values provide more suggestions but may use slightly more memory"
      )
      .addDropdown((dropdown) => {
        for (let i = 1; i <= maxChunks; i++) {
          // chunk is ~10K words
          const words = i * 10;
          dropdown.addOption(i.toString(), `${words}K`);
        }

        dropdown.setValue(currentSize.toString()).onChange(async (value) => {
          const newSize = parseInt(value);
          const oldSize = this.plugin.settings.dictionarySize;

          if (isNaN(newSize) || newSize < 1 || newSize > maxChunks) {
            new Notice("Invalid dictionary size");
            dropdown.setValue(oldSize.toString());
            return;
          }

          if (newSize !== oldSize) {
            try {
              const updateSuccess = await this.plugin.client
                .getConfigManager()
                .updateConfig({
                  dictionarySize: newSize,
                });
              if (updateSuccess) {
                this.plugin.settings.dictionarySize = newSize;
                await this.plugin.saveSettings();
                logger.config("Dictionary size changed", {
                  from: oldSize,
                  to: newSize,
                });
                new Notice(`Dictionary size updated`);
              } else {
                new Notice(`Failed to update dictionary size in config file`);
                dropdown.setValue(oldSize.toString());
              }
            } catch (error) {
              logger.error("Failed to update dictionary size:", error);
              new Notice("Failed to update dictionary size");
              dropdown.setValue(oldSize.toString());
            }
          }
        });
      });
  }

  private async getAvailableDictionaryFiles(): Promise<number> {
    try {
      // Try to get info from the client about available chunks
      const response = await this.plugin.client.getDictionaryInfo();
      if (response && response.status === "ok" && response.available_chunks) {
        return response.available_chunks;
      }
      return 7; // Fallback default
    } catch (error) {
      logger.warn("Could not detect dictionary files, using default", error);
      return 7;
    }
  }

  private loadFontSizeTheme(): void {
    document.body.setAttribute(
      "data-typer-font-size",
      this.plugin.settings.fontSize
    );
  }

  private loadFontWeightTheme(): void {
    document.body.setAttribute(
      "data-typer-font-weight",
      this.plugin.settings.fontWeight
    );
  }
}

// DebugWarningModal removed

class AutoRespawnWarningModal extends Modal {
  readonly onConfirm: () => Promise<void>;
  readonly onCancel: () => void;

  constructor(app: App, onConfirm: () => Promise<void>, onCancel: () => void) {
    super(app);
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Disable Auto-Respawn?" });

    contentEl.createEl("p", {
      text: "auto spawning WordServe helps keeping the plugin stable and responsive.",
    });

    contentEl.createEl("p", {
      text: "Disabling this feature may cause bigger memory usage",
      cls: "mod-warning",
    });

    const buttonContainer = contentEl.createDiv({
      cls: "modal-button-container",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Keep Enabled",
    });
    cancelButton.onclick = () => {
      this.onCancel();
      this.close();
    };

    const confirmButton = buttonContainer.createEl("button", {
      text: "Disable",
      cls: "mod-warning",
    });
    confirmButton.onclick = async () => {
      await this.onConfirm();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
