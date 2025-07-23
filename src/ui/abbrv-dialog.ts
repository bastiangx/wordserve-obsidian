import { App, Modal, TextAreaComponent, TextComponent, ButtonComponent, Notice } from "obsidian";
import { AbbreviationManager } from "../core/abbrv";
import { AbbreviationEntry } from "../types";
import WordServePlugin from "../../main";
import { CONFIG } from "../core/config";

/** Modal dialog for managing text abbreviations and shortcuts. */
export class AbbreviationDialog extends Modal {
  private abbreviationManager: AbbreviationManager;
  private plugin: WordServePlugin;
  private entries: AbbreviationEntry[] = [];
  private filteredEntries: AbbreviationEntry[] = [];
  private searchInput: TextComponent;
  private sortBy: "newest" | "oldest" | "alphabetical-asc" | "alphabetical-desc" = "newest";

  constructor(app: App, plugin: WordServePlugin, abbreviationManager: AbbreviationManager) {
    super(app);
    this.plugin = plugin;
    this.abbreviationManager = abbreviationManager;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;

    modalEl.addClass("wordserve-abbreviation-dialog");

    contentEl.empty();

    contentEl.createEl("h2", { text: "Shortcuts & Abbreviations" });

    await this.createControls();

    const addButtonContainer = contentEl.createDiv({ cls: "wordserve-add-button-container" });
    const addButton = new ButtonComponent(addButtonContainer);
    addButton
      .setButtonText("+ Add")
      .setCta()
      .onClick(() => this.addNewEntry());

    const entriesContainer = contentEl.createDiv({ cls: "wordserve-entries-container" });
    this.refreshEntries(entriesContainer);
  }

  private async createControls() {
    const { contentEl } = this;
    const controlsContainer = contentEl.createDiv({ cls: "wordserve-controls-container" });

    const searchContainer = controlsContainer.createDiv({ cls: "wordserve-search-container" });
    searchContainer.createEl("label", { text: "Search shortcuts:" });

    this.searchInput = new TextComponent(searchContainer);
    this.searchInput
      .setPlaceholder("")
      .onChange((value) => {
        this.filterEntries(value);
        this.renderEntries();
      });

    const sortContainer = controlsContainer.createDiv({ cls: "wordserve-sort-container" });
    sortContainer.createEl("label", { text: "Sort:" });

    const sortSelect = sortContainer.createEl("select");
    const sortOptions = [
      { value: "newest", text: "Newest" },
      { value: "oldest", text: "Oldest" },
      { value: "alphabetical-asc", text: "A-Z" },
      { value: "alphabetical-desc", text: "Z-A" }
    ];

    sortOptions.forEach(option => {
      const optionEl = sortSelect.createEl("option", { value: option.value, text: option.text });
      if (option.value === this.sortBy) {
        optionEl.selected = true;
      }
    });

    sortSelect.addEventListener("change", (e) => {
      this.sortBy = (e.target as HTMLSelectElement).value as typeof this.sortBy;
      this.refreshEntries();
    });
  }

  private filterEntries(query: string = "") {
    if (!query.trim()) {
      this.filteredEntries = this.entries;
    } else {
      this.filteredEntries = this.abbreviationManager.searchAbbreviations(query);
    }
  }

  private refreshEntries(container?: HTMLElement) {
    this.entries = this.abbreviationManager.getAllAbbreviations();

    // Update filtered entries based on current search
    const currentSearch = this.searchInput?.getValue() || "";
    this.filterEntries(currentSearch);

    // Render the UI
    this.renderEntries(container);
  }

  private renderEntries(container?: HTMLElement) {
    const { contentEl } = this;
    const entriesContainer = container || contentEl.querySelector(".wordserve-entries-container") as HTMLElement;
    if (!entriesContainer) return;

    entriesContainer.empty();

    // Use the filtered entries
    const sortedEntries = this.abbreviationManager.sortAbbreviations(this.filteredEntries, this.sortBy);

    if (sortedEntries.length === 0) {
      entriesContainer.createEl("p", {
        text: "No entries found! Create a new one or refine your search.",
        cls: "wordserve-no-entries"
      });
      return;
    }

    sortedEntries.forEach(entry => {
      this.createEntryRow(entriesContainer, entry);
    });
  }

  private validateInput(shortcut: string, target: string): boolean {
    // Validate shortcut
    if (!shortcut || shortcut.length === 0) {
      new Notice("Shortcut cannot be empty", 3000);
      return false;
    }

    if (shortcut.length > CONFIG.abbreviations.maxShortcutLength) {
      new Notice(`Shortcut too long! Maximum ${CONFIG.abbreviations.maxShortcutLength} characters allowed`, 3000);
      return false;
    }

    // Check for valid UTF-8 characters (letters, numbers, symbols)
    // Exclude control characters and problematic characters
    const validPattern = /^[\p{L}\p{N}\p{P}\p{S}]+$/u;
    if (!validPattern.test(shortcut)) {
      new Notice("Shortcut contains invalid characters. Use letters, numbers, and symbols only", 3000);
      return false;
    }

    // Validate target
    if (!target || target.length === 0) {
      new Notice("Target phrase cannot be empty", 3000);
      return false;
    }

    if (target.length > CONFIG.abbreviations.maxTargetLength) {
      new Notice(`Target phrase too long! Maximum ${CONFIG.abbreviations.maxTargetLength} characters allowed`, 3000);
      return false;
    }

    if (target.includes('\0') || target.includes('\x01') || target.includes('\x02')) {
      new Notice("Target phrase contains invalid control characters", 3000);
      return false;
    }

    return true;
  }

  private validateShortcut(shortcut: string): boolean {
    if (!shortcut || shortcut.length === 0) return false;
    if (shortcut.length > CONFIG.abbreviations.maxShortcutLength) return false;
    const validPattern = /^[\p{L}\p{N}\p{P}\p{S}]+$/u;
    return validPattern.test(shortcut);
  }

  private validateTarget(target: string): boolean {
    if (!target || target.length === 0) return false;
    if (target.length > CONFIG.abbreviations.maxTargetLength) return false;
    return !target.includes('\0') && !target.includes('\x01') && !target.includes('\x02');
  }

  private addInputValidation(shortcutInput: TextComponent, targetTextarea: TextAreaComponent) {
    // Add character count and validation for shortcut
    shortcutInput.onChange((value) => {
      const isValid = this.validateShortcut(value);
      shortcutInput.inputEl.removeClass("wordserve-input-valid", "wordserve-input-invalid");
      shortcutInput.inputEl.addClass(isValid ? "wordserve-input-valid" : "wordserve-input-invalid");

      // Update character count
      const container = shortcutInput.inputEl.parentElement;
      if (container) {
        let counter = container.querySelector(".wordserve-char-counter") as HTMLElement;
        if (!counter) {
          counter = container.createEl("div", { cls: "wordserve-char-counter" });
        }
        counter.textContent = `${value.length}/${CONFIG.abbreviations.maxShortcutLength}`;
        counter.removeClass("wordserve-counter-warning", "wordserve-counter-error");
        if (value.length > CONFIG.abbreviations.maxShortcutLength * 0.8) {
          counter.addClass("wordserve-counter-warning");
        }
        if (value.length > CONFIG.abbreviations.maxShortcutLength) {
          counter.addClass("wordserve-counter-error");
        }
      }
    });

    // Add validation for target
    targetTextarea.onChange((value) => {
      const isValid = this.validateTarget(value);
      targetTextarea.inputEl.removeClass("wordserve-input-valid", "wordserve-input-invalid");
      targetTextarea.inputEl.addClass(isValid ? "wordserve-input-valid" : "wordserve-input-invalid");
    });
  }

  private createEntryRow(container: HTMLElement, entry: AbbreviationEntry, isNew = false) {
    const rowContainer = container.createDiv({ cls: "wordserve-entry-row" });
    if (isNew) rowContainer.addClass("wordserve-entry-new");

    // Input fields container
    const fieldsContainer = rowContainer.createDiv({ cls: "wordserve-entry-fields" });

    // Shortcut input
    const shortcutContainer = fieldsContainer.createDiv({ cls: "wordserve-shortcut-container" });
    const shortcutInput = new TextComponent(shortcutContainer);
    shortcutInput
      .setPlaceholder("put your shortcut here")
      .setValue(entry.shortcut)
      .setDisabled(!isNew);

    // Target textarea
    const targetContainer = fieldsContainer.createDiv({ cls: "wordserve-target-container" });
    const targetTextarea = new TextAreaComponent(targetContainer);
    targetTextarea
      .setPlaceholder("put your full text here")
      .setValue(entry.target)
      .setDisabled(!isNew);

    // Add validation for inputs when creating new entries or enabling edit mode
    if (isNew) {
      this.addInputValidation(shortcutInput, targetTextarea);
    }

    // Action buttons container
    const actionsContainer = rowContainer.createDiv({ cls: "wordserve-entry-actions" });

    if (isNew) {
      // Save and Cancel buttons for new entries
      const saveButton = new ButtonComponent(actionsContainer);
      saveButton
        .setButtonText("Save")
        .setCta()
        .onClick(async () => {
          const shortcut = shortcutInput.getValue().trim();
          const target = targetTextarea.getValue().trim();

          if (!this.validateInput(shortcut, target)) {
            return;
          }

          const success = await this.abbreviationManager.addAbbreviation(shortcut, target);
          if (success) {
            this.refreshEntries();
          } else {
            new Notice("Failed to add shortcut. It may already exist.", 3000);
          }
        });

      const cancelButton = new ButtonComponent(actionsContainer);
      cancelButton
        .setButtonText("Cancel")
        .onClick(() => {
          rowContainer.remove();
        });
    } else {
      // Modify and Remove buttons for existing entries
      const modifyButton = new ButtonComponent(actionsContainer);
      modifyButton
        .setButtonText("Modify")
        .onClick(() => {
          shortcutInput.setDisabled(false);
          targetTextarea.setDisabled(false);

          // Add validation for the now-enabled inputs
          this.addInputValidation(shortcutInput, targetTextarea);

          // Replace modify button with save/cancel
          modifyButton.buttonEl.remove();
          removeButton.buttonEl.remove();

          const saveButton = new ButtonComponent(actionsContainer);
          saveButton
            .setButtonText("Save")
            .setCta()
            .onClick(async () => {
              const newShortcut = shortcutInput.getValue().trim();
              const newTarget = targetTextarea.getValue().trim();

              if (!this.validateInput(newShortcut, newTarget)) {
                return;
              }

              const success = await this.abbreviationManager.updateAbbreviation(
                entry.shortcut,
                newShortcut,
                newTarget
              );
              if (success) {
                this.refreshEntries();
              } else {
                new Notice("Failed to update shortcut. maybe you entered a duplicate?", 3000);
              }
            });

          const cancelButton = new ButtonComponent(actionsContainer);
          cancelButton
            .setButtonText("Cancel")
            .onClick(() => {
              this.refreshEntries();
            });
        });

      const removeButton = new ButtonComponent(actionsContainer);
      removeButton
        .setButtonText("Remove")
        .setWarning()
        .onClick(async () => {
          const success = await this.abbreviationManager.removeAbbreviation(entry.shortcut);
          if (success) {
            this.refreshEntries();
          } else {
            new Notice("Failed to remove shortcut, maybe refresh the list?", 3000);
          }
        });
    }
  }

  private addNewEntry() {
    const { contentEl } = this;
    const entriesContainer = contentEl.querySelector(".wordserve-entries-container") as HTMLElement;
    if (!entriesContainer) return;

    // Create a temporary entry for the new row
    const newEntry: AbbreviationEntry = {
      shortcut: "",
      target: "",
      created: Date.now()
    };

    // Insert at the beginning
    const firstChild = entriesContainer.firstChild;
    const tempContainer = entriesContainer.createDiv();
    this.createEntryRow(tempContainer, newEntry, true);

    if (firstChild) {
      entriesContainer.insertBefore(tempContainer.firstChild!, firstChild);
    } else {
      entriesContainer.appendChild(tempContainer.firstChild!);
    }

    tempContainer.remove();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
