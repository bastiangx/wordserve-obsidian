import { App, Notice, PluginSettingTab, Setting, Modal } from "obsidian";
import TyperPlugin from "../../main";
import { CONFIG } from "../core/config";
import { TyperPreview } from "../ui/preview";
import { AbbreviationDialog } from "../ui/abbrv-dialog";
import { logger } from "../utils/logger";

export class TyperSettingTab extends PluginSettingTab {
  plugin: TyperPlugin;
  private preview: TyperPreview | null = null;

  constructor(app: App, plugin: TyperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Render the settings
    this.renderSettings(containerEl);
  }

  private async renderSettings(containerEl: HTMLElement): Promise<void> {

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
            const oldValue = this.plugin.settings.minWordLength;
            this.plugin.settings.minWordLength = value;
            this.plugin.suggestor.minChars = value;
            this.updatePreview();
            
            // Update TOML config file for core
            const success = await this.plugin.client.updateConfigFile({
              minPrefix: value
            });
            
            if (success) {
              // Restart the backend to pick up new config
              await this.plugin.client.restart();
            }
            
            logger.config("Min word length changed", {
              from: oldValue,
              to: value,
              tomlUpdated: success
            });
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
            const oldValue = this.plugin.settings.maxSuggestions;
            this.plugin.settings.maxSuggestions = value;
            this.plugin.suggestor.limit = value;
            
            // Update TOML config file for core
            const success = await this.plugin.client.updateConfigFile({
              maxLimit: value
            });
            
            if (success) {
              // Restart the backend to pick up new config
              await this.plugin.client.restart();
            }
            
            logger.config("Max suggestions changed", {
              from: oldValue,
              to: value,
              tomlUpdated: success
            });
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
            this.updatePreview();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Rankings Override")
      .setDesc(
        "Always show suggestion rankings, even if digit selection is off."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRankingOverride)
          .onChange(async (value) => {
            this.plugin.settings.showRankingOverride = value;
            this.plugin.suggestor.showRankingOverride = value;
            this.updatePreview();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Debounce time")
      .setDesc("Time to wait after typing before showing suggestions menu")
      .setTooltip("Enter a number between 1 and 2000 milliseconds",)
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
          this.updatePreview();
          await this.plugin.saveSettings();
          text.setValue(numValue.toString());
        });
        return text;
      });

    // Shortcuts & Abbreviations Section
    containerEl.createEl("h3", { text: "Shortcuts & Abbreviations" });

    new Setting(containerEl)
      .setName("Enable abbreviations")
      .setDesc("Enable shortcuts and text expansion functionality")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.abbreviationsEnabled)
          .onChange(async (value) => {
            this.plugin.settings.abbreviationsEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show abbreviation notification")
      .setDesc("Display a notification when an abbreviation is expanded")
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
      .setDesc("View and edit your shortcuts and their expansions")
      .addButton((button) =>
        button
          .setButtonText("Edit your Shortcuts")
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
    containerEl.createEl("h3", { text: "Rendering" });

    new Setting(containerEl)
      .setName("Compact mode")
      .setDesc(
        "Makes the UI more compact with smaller paddings, margins, and scrollbars"
      )
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
      .setName("Font size")
      .setDesc("Font size for suggestion text")
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
            this.updateBodyClasses();
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("Font weight")
      .setDesc("Font weight for suggestion text")
      .addDropdown((dropdown) => {
        dropdown.addOption("thin", "Thin (100)");
        dropdown.addOption("extralight", "Extra Light (200)");
        dropdown.addOption("light", "Light (300)");
        dropdown.addOption("normal", "Normal (400)");
        dropdown.addOption("medium", "Medium (500)");
        dropdown.addOption("semibold", "Semi Bold (600)");
        dropdown.addOption("bold", "Bold (700)");
        dropdown.addOption("extrabold", "Extra Bold (800)");
        dropdown.addOption("black", "Black (900)");
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
            this.updateBodyClasses();
            await this.plugin.saveSettings();
          }
        );
      });

    // Dictionary Section
    containerEl.createEl("h3", { text: "Dictionary" });

    // Add dictionary size setting
    await this.addDictionarySizeSetting(containerEl);

    // Accessibility Section
    containerEl.createEl("h3", { text: "Accessibility" });

    new Setting(containerEl)
      .setName("Bold suffix")
      .setDesc("Makes the non-prefix part of suggestions bold")
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
      .setName("Uppercase suggestions")
      .setDesc("Shows all suggestions in uppercase letters")
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
      .setName("Prefix color intensity")
      .setDesc("Controls how muted the prefix characters appear in suggestions")
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
            this.updatePreview();
            await this.plugin.saveSettings();
          }
        );
      });

    // Debug Section
    containerEl.createEl("h3", { text: "Debugging" });

    new Setting(containerEl)
      .setName("Toggle Debug Mode")
      .setDesc(
        "Intended for advanced users only. Enables detailed logging, status bar, and debug output from core library. May impact performance."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugMode)
          .onChange(async (value) => {
            if (value && !this.plugin.settings.debugMode) {
              new DebugWarningModal(
                this.app,
                async () => {
                  this.plugin.settings.debugMode = true;
                  logger.setDebugMode(true);
                  this.plugin.updateDebugStatusBar();
                  await this.plugin.saveSettings();
                  toggle.setValue(true);
                },
                () => {
                  toggle.setValue(false);
                }
              ).open();
            } else {
              this.plugin.settings.debugMode = value;
              logger.setDebugMode(value);
              this.plugin.updateDebugStatusBar();
              await this.plugin.saveSettings();
            }
          })
      );

    this.createDebugEventsSection(containerEl);

    // Theme & Colors Section with Live Preview
    containerEl.createEl("h3", { text: "Theme & Colors" });

    const previewContainer = containerEl.createDiv({
      cls: "typer-theme-section",
    });
    this.createLivePreview(previewContainer);
  }

  private createLivePreview(containerEl: HTMLElement): void {
    // Clean up existing preview
    if (this.preview) {
      this.preview.unload();
      this.preview = null;
    }

    // Create new preview instance
    this.preview = new TyperPreview(
      this.app,
      this.plugin,
      this.plugin.client,
      containerEl
    );

    // Load the preview
    this.preview.load();
  }

  private updatePreview(): void {
    if (this.preview) {
      this.preview.updateSettings();
    }
  }

  private destroyPreview(): void {
    if (this.preview) {
      this.preview.unload();
      this.preview = null;
    }
  }

  // Override the hide method to clean up preview when settings tab is closed
  hide(): void {
    this.destroyPreview();
    super.hide();
  }

  private updateBodyClasses(): void {
    const body = document.body;

    // Compact mode
    body.toggleClass("typer-compact-mode", this.plugin.settings.compactMode);

    // Font size classes
    body.removeClass(
      "typer-font-smallest",
      "typer-font-smaller",
      "typer-font-small",
      "typer-font-editor",
      "typer-font-ui-small",
      "typer-font-ui-medium",
      "typer-font-ui-larger"
    );
    body.addClass(`typer-font-${this.plugin.settings.fontSize}`);

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
    body.addClass(`typer-weight-${this.plugin.settings.fontWeight}`);

    // Accessibility classes
    body.toggleClass(
      "typer-bold-suffix",
      this.plugin.settings.accessibility.boldSuffix
    );
    body.toggleClass(
      "typer-uppercase",
      this.plugin.settings.accessibility.uppercaseSuggestions
    );

    // Prefix color intensity
    body.removeClass(
      "typer-prefix-normal",
      "typer-prefix-muted",
      "typer-prefix-faint",
      "typer-prefix-accent"
    );
    body.addClass(
      `typer-prefix-${this.plugin.settings.accessibility.prefixColorIntensity}`
    );

    // Update preview to reflect changes
    this.updatePreview();
  }

  private createDebugEventsSection(containerEl: HTMLElement): void {
    // Create collapsible debug events section
    const debugEventsDetails = containerEl.createEl("details", {
      cls: "typer-debug-events",
    });
    debugEventsDetails.style.marginTop = "20px";

    const summary = debugEventsDetails.createEl("summary", {
      text: "Debug Events",
      cls: "typer-debug-summary",
    });
    summary.style.cursor = "pointer";
    summary.style.fontWeight = "600";
    summary.style.marginBottom = "10px";

    const debugContent = debugEventsDetails.createEl("div", {
      cls: "typer-debug-content",
    });
    debugContent.style.marginLeft = "15px";

    debugContent.createEl("p", {
      text: "Control what gets logged to console. Each option has a unique prefix for easy filtering.",
      cls: "setting-item-description",
    });

    // MessagePack data logging
    new Setting(debugContent)
      .setName("MessagePack data [MP]")
      .setDesc("Log binary MessagePack data sent/received with decoded content")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debug.msgpackData)
          .onChange(async (value) => {
            this.plugin.settings.debug.msgpackData = value;
            logger.setDebugSettings(this.plugin.settings.debug);
            logger.config("Debug option changed", { msgpackData: value });
            await this.plugin.saveSettings();
          })
      );

    // Menu render events
    new Setting(debugContent)
      .setName("Menu render events [MENU]")
      .setDesc(
        "Log suggestion menu UI: rows, styling, colors, themes, digit selection display (excludes suggestion content)"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debug.menuRender)
          .onChange(async (value) => {
            this.plugin.settings.debug.menuRender = value;
            logger.setDebugSettings(this.plugin.settings.debug);
            logger.config("Debug option changed", { menuRender: value });
            await this.plugin.saveSettings();
          })
      );

    // Config change events (includes settings)
    new Setting(debugContent)
      .setName("Config & settings changes [CFG]")
      .setDesc(
        "Log plugin settings changes, configuration updates and core library config changes"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debug.configChange)
          .onChange(async (value) => {
            this.plugin.settings.debug.configChange = value;
            logger.setDebugSettings(this.plugin.settings.debug);
            logger.config("Debug option changed", { configChange: value });
            await this.plugin.saveSettings();
          })
      );

    // Render events (verbose)
    new Setting(debugContent)
      .setName("Render events [RENDER] (Verbose)")
      .setDesc(
        "Log detailed menu positioning, sizing, DOM manipulation and rendering performance - very verbose (excludes suggestion content)"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debug.renderEvents)
          .onChange(async (value) => {
            this.plugin.settings.debug.renderEvents = value;
            logger.setDebugSettings(this.plugin.settings.debug);
            logger.config("Debug option changed", { renderEvents: value });
            await this.plugin.saveSettings();
          })
      );

    // Abbreviation events
    new Setting(debugContent)
      .setName("Abbreviation events [ABBR]")
      .setDesc("Log abbreviation expansions, file operations and shortcut detection")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debug.abbrEvents)
          .onChange(async (value) => {
            this.plugin.settings.debug.abbrEvents = value;
            logger.setDebugSettings(this.plugin.settings.debug);
            logger.config("Debug option changed", { abbrEvents: value });
            await this.plugin.saveSettings();
          })
      );

    new Setting(debugContent)
      .setName("Force rebuild core")
      .setDesc(
        "Restarts typer's core process. Use this ONLY if you encounter unrecoverable errors or want a fresh start without disabling the plugin."
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

  private async addDictionarySizeSetting(
    containerEl: HTMLElement
  ): Promise<void> {
    const currentSize = this.plugin.settings.dictionarySize;

    // Count available dictionary files dynamically
    const maxChunks = await this.getAvailableDictionaryFiles();

    new Setting(containerEl)
      .setName("Dictionary size")
      .setDesc(
        "Number of words to load. Higher values provide more suggestions but use more memory."
      )
      .addDropdown((dropdown) => {
        // Generate options based on available dictionary files
        for (let i = 1; i <= maxChunks; i++) {
          const words = i * 10; // Each chunk is ~10K words
          dropdown.addOption(i.toString(), `${words}K words`);
        }

        dropdown
          .setValue(currentSize.toString())
          .onChange(async (value) => {
            const newSize = parseInt(value);
            const oldSize = this.plugin.settings.dictionarySize;

            if (isNaN(newSize) || newSize < 1 || newSize > maxChunks) {
              new Notice("Invalid dictionary size");
              dropdown.setValue(oldSize.toString());
              return;
            }

            if (newSize !== oldSize) {
              try {
                const updateResponse = await this.plugin.client.setDictionarySize(newSize);
                if (updateResponse.status === "ok") {
                  this.plugin.settings.dictionarySize = newSize;
                  await this.plugin.saveSettings();
                  logger.config("Dictionary size changed", {
                    from: oldSize,
                    to: newSize,
                  });
                  new Notice(`Dictionary size updated`);
                } else {
                  new Notice(`Failed to update dictionary size: ${updateResponse.error}`);
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
      const response = await this.plugin.client.getAvailableChunkCount();
      if (response && response.status === "ok" && response.available_chunks) {
        return response.available_chunks;
      }
      return 7; // Fallback default
    } catch (error) {
      logger.warn("Could not detect dictionary files, using default", error);
      return 7;
    }
  }
}

class DebugWarningModal extends Modal {
  private onConfirm: () => Promise<void>;
  private onCancel: () => void;

  constructor(app: App, onConfirm: () => Promise<void>, onCancel: () => void) {
    super(app);
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Enable Debug Mode?" });

    contentEl.createEl("p", {
      text: "Debug mode is intended for advanced users and developers only.",
    });
    contentEl.createEl("p", { text: "It will:" });

    const list = contentEl.createEl("ul");
    list.createEl("li", { text: "Enable detailed console logging" });
    list.createEl("li", { text: "Show status bar with connection status" });
    list.createEl("li", { text: "Enable debug output from core library" });
    list.createEl("li", { text: "Display core library messages" });
    list.createEl("li", { text: "May impact performance" });

    contentEl.createEl("p", { text: "Are you sure you want to continue?" });

    const buttonContainer = contentEl.createDiv({
      cls: "modal-button-container",
    });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.onclick = () => {
      this.onCancel();
      this.close();
    };

    const confirmButton = buttonContainer.createEl("button", {
      text: "Enable Debug Mode",
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
