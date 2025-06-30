import { App, Component, debounce, TextAreaComponent } from "obsidian";
import { TyperClient } from "../core/client";
import { Suggestion } from "../types";
import {
  capitalizeWord,
  getCapitalizedIndexes,
  hasOnlyNumbersOrSpecialChars,
} from "../utils/string";
import TyperPlugin from "../../main";
import { logger } from "../utils/logger";

export class TyperPreview extends Component {
  private app: App;
  private plugin: TyperPlugin;
  private client: TyperClient;
  private containerEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private suggestionsEl: HTMLElement;
  private currentSuggestions: Suggestion[] = [];
  private cachedSuggestions: Record<string, Suggestion[]> = {};
  private debouncedGetSuggestions: (query: string) => void;
  
  private readonly PREVIEW_LIMIT = 4;
  private readonly MIN_CONTAINER_WIDTH = 400;

  constructor(app: App, plugin: TyperPlugin, client: TyperClient, containerEl: HTMLElement) {
    super();
    this.app = app;
    this.plugin = plugin;
    this.client = client;
    this.containerEl = containerEl;
    
    this.debouncedGetSuggestions = debounce(
      this.fetchSuggestions.bind(this),
      this.plugin.settings.debounceTime,
      true
    );
  }

  onload(): void {
    this.createPreview();
    if (this.inputEl) {
      this.loadInitialSuggestions();
    }
    
    // Add window resize listener for responsive design
    this.registerDomEvent(window, 'resize', this.handleResize.bind(this));
  }

  onunload(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.cachedSuggestions = {};
    this.currentSuggestions = [];
    if (this.containerEl) {
      this.containerEl.empty();
    }
  }

  private createPreview(): void {
    // Check if container is wide enough
    if (this.containerEl.clientWidth < this.MIN_CONTAINER_WIDTH) {
      return; // Hide preview on small screens
    }

    const previewContainer = this.containerEl.createDiv({ cls: "typer-preview-container" });
    
    // Preview header
    const header = previewContainer.createDiv({ cls: "typer-preview-header" });
    header.createSpan({ text: "Live Preview", cls: "typer-preview-title" });
    header.createSpan({ 
      text: "Type to see how suggestions look with your current settings",
      cls: "typer-preview-description"
    });

    // Input area
    const inputContainer = previewContainer.createDiv({ cls: "typer-preview-input-container" });
    this.inputEl = inputContainer.createEl("textarea", {
      cls: "typer-preview-input",
      attr: {
        placeholder: "Type something...",
        rows: "1"
      }
    });

    // Suggestions container - always visible with 4 fixed rows
    this.suggestionsEl = previewContainer.createDiv({ cls: "typer-preview-suggestions" });
    this.createFixedSuggestionRows();

    // Event listeners
    this.inputEl.addEventListener("input", this.onInputChange.bind(this));
    this.inputEl.addEventListener("keydown", this.onKeyDown.bind(this));

    // Auto-resize textarea
    this.inputEl.addEventListener("input", () => {
      this.inputEl.style.height = "auto";
      this.inputEl.style.height = this.inputEl.scrollHeight + "px";
    });
  }

  private onInputChange(): void {
    const text = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart;
    
    // Find the current word at cursor position
    const currentWord = this.getCurrentWord(text, cursorPos);
    
    if (!currentWord || 
        currentWord.length < this.plugin.settings.minWordLength ||
        hasOnlyNumbersOrSpecialChars(currentWord)) {
      this.clearSuggestions();
      return;
    }

    this.debouncedGetSuggestions(currentWord);
  }

  private onKeyDown(evt: KeyboardEvent): void {
    // Prevent certain keys that might interfere with the preview
    if (evt.key === "Tab" || evt.key === "Enter") {
      evt.preventDefault();
    }
  }

  private getCurrentWord(text: string, cursorPos: number): string {
    let start = cursorPos;
    let end = cursorPos;

    // Move start back to beginning of word
    while (start > 0 && /[\w'-]/.test(text.charAt(start - 1))) {
      start--;
    }

    // Move end forward to end of word
    while (end < text.length && /[\w'-]/.test(text.charAt(end))) {
      end++;
    }

    return text.slice(start, end);
  }

  private async fetchSuggestions(query: string): Promise<void> {
    const lowerCaseQuery = query.toLowerCase();
    
    // Check cache first
    if (this.cachedSuggestions[lowerCaseQuery]) {
      this.updateSuggestions(query, this.cachedSuggestions[lowerCaseQuery]);
      return;
    }

    try {
      const response = await this.client.getCompletions(lowerCaseQuery, this.PREVIEW_LIMIT);
      const rawSuggestions = response.suggestions || [];
      
      // Filter out the current word and cache the results
      const filteredSuggestions = rawSuggestions.filter(
        (s: Suggestion) => s.word.toLowerCase() !== lowerCaseQuery
      );
      
      this.cachedSuggestions[lowerCaseQuery] = filteredSuggestions;
      this.updateSuggestions(query, filteredSuggestions);
    } catch (error) {
      logger.error("Typer Preview: Error fetching suggestions:", error);
      this.clearSuggestions();
    }
  }

  private updateSuggestions(query: string, suggestions: Suggestion[]): void {
    const capitalizedIndexes = getCapitalizedIndexes(query);
    
    this.currentSuggestions = suggestions.slice(0, this.PREVIEW_LIMIT).map((s) => ({
      ...s,
      word: capitalizeWord(s.word, capitalizedIndexes),
    }));

    this.renderSuggestions(query);
  }

  private renderSuggestions(query: string): void {
    // Update existing fixed rows instead of recreating them
    const existingRows = this.suggestionsEl.querySelectorAll('.typer-preview-suggestion-item');
    
    for (let i = 0; i < this.PREVIEW_LIMIT; i++) {
      const rowEl = existingRows[i] as HTMLElement;
      const container = rowEl.querySelector('.typer-suggestion-container') as HTMLElement;
      const rankEl = container.querySelector('.typer-suggestion-rank') as HTMLElement;
      const contentEl = container.querySelector('.typer-suggestion-content') as HTMLElement;
      
      if (i < this.currentSuggestions.length) {
        // Show suggestion data
        const suggestion = this.currentSuggestions[i];
        const displayRank = i + 1;
        
        // Update rank
        if (this.plugin.settings.numberSelection || this.plugin.settings.showRankingOverride) {
          rankEl.setText(`${displayRank}`);
          rankEl.style.visibility = "visible";
        } else {
          rankEl.setText("");
          rankEl.style.visibility = "hidden";
        }
        
        // Update content with prefix highlighting
        contentEl.empty();
        const queryLower = query.toLowerCase();
        const wordLower = suggestion.word.toLowerCase();
        
        if (wordLower.startsWith(queryLower)) {
          const prefixLength = query.length;
          const prefix = suggestion.word.substring(0, prefixLength);
          const suffix = suggestion.word.substring(prefixLength);
          
          const prefixSpan = contentEl.createSpan({ cls: "suggestion-prefix" });
          prefixSpan.setText(prefix);
          
          const suffixSpan = contentEl.createSpan({ cls: "suggestion-suffix" });
          suffixSpan.setText(suffix);
        } else {
          contentEl.setText(suggestion.word);
        }
        
        // Remove empty row styling
        rowEl.removeClass('typer-preview-empty-row');
      } else {
        // Show empty row
        rankEl.setText("");
        rankEl.style.visibility = "hidden";
        contentEl.empty();
        contentEl.setText("");
        
        // Add empty row styling
        rowEl.addClass('typer-preview-empty-row');
      }
    }
  }

  private clearSuggestions(): void {
    // Clear suggestions but keep rows visible
    this.currentSuggestions = [];
    this.renderSuggestions(""); // Render with empty suggestions
  }

  private createFixedSuggestionRows(): void {
    // Always show 4 empty suggestion rows to prevent content shifting
    this.suggestionsEl.style.display = "block";
    
    for (let i = 0; i < this.PREVIEW_LIMIT; i++) {
      const suggestionEl = this.suggestionsEl.createDiv({ 
        cls: "suggestion-item typer-preview-suggestion-item typer-preview-empty-row" 
      });

      const container = suggestionEl.createDiv({ cls: "typer-suggestion-container" });

      // Rank element (empty placeholder)
      const rankEl = container.createSpan({ cls: "typer-suggestion-rank" });
      rankEl.style.visibility = "hidden"; // Keep space but invisible

      // Content element (empty placeholder)
      const contentEl = container.createSpan({ cls: "typer-suggestion-content" });
      contentEl.setText(""); // Empty content
    }
  }

  private async loadInitialSuggestions(): Promise<void> {
    // Just initialize the preview without focusing
    const text = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart;
    const currentWord = this.getCurrentWord(text, cursorPos);
    if (currentWord) {
      this.debouncedGetSuggestions(currentWord);
    }
  }

  public updateSettings(): void {
    // Update debounce timing
    this.debouncedGetSuggestions = debounce(
      this.fetchSuggestions.bind(this),
      this.plugin.settings.debounceTime,
      true
    );

    // Re-render current suggestions with new settings
    if (this.currentSuggestions.length > 0) {
      const text = this.inputEl.value;
      const cursorPos = this.inputEl.selectionStart;
      const currentWord = this.getCurrentWord(text, cursorPos);
      if (currentWord) {
        this.renderSuggestions(currentWord);
      }
    }
  }

  public refresh(): void {
    // Clear cache and re-fetch current suggestions
    this.cachedSuggestions = {};
    const text = this.inputEl.value;
    const cursorPos = this.inputEl.selectionStart;
    const currentWord = this.getCurrentWord(text, cursorPos);
    
    if (currentWord && 
        currentWord.length >= this.plugin.settings.minWordLength &&
        !hasOnlyNumbersOrSpecialChars(currentWord)) {
      this.debouncedGetSuggestions(currentWord);
    }
  }

  private handleResize(): void {
    // Check if the container is now too small and hide/show preview accordingly
    const isWideEnough = this.containerEl.clientWidth >= this.MIN_CONTAINER_WIDTH;
    const hasPreview = this.inputEl !== undefined;
    
    if (!isWideEnough && hasPreview) {
      // Hide preview on small screens
      this.cleanup();
    } else if (isWideEnough && !hasPreview) {
      // Show preview when screen becomes wide enough
      this.createPreview();
      if (this.inputEl) {
        this.loadInitialSuggestions();
      }
    }
  }
}
