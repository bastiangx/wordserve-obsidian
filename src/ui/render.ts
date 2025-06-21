import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from "obsidian";
import { TyperClient } from "../core/client";
import { CONFIG } from "../core/config";
import { Suggestion } from "../models/types";
import {
  capitalizeWord,
  getCapitalizedIndexes,
  hasOnlyNumbersOrSpecialChars,
} from "../utils/string";

export class TyperSuggest extends EditorSuggest<Suggestion> {
  public minChars: number = CONFIG.plugin.minWordLength;
  public maxChars: number = CONFIG.internals.maxChars;
  public limit: number = CONFIG.plugin.maxSuggestions;
  public debounceDelay: number = CONFIG.plugin.debounceTime;
  public numberSelectionEnabled: boolean = CONFIG.plugin.numberSelection;
  public fuzzyMatching: boolean = CONFIG.plugin.fuzzyMatching;

  private lastWord = "";
  private lastSuggestions: Suggestion[] = [];
  private cachedSuggestions: Record<string, Suggestion[]> = {};
  private selected: boolean = false;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private ipc: TyperClient;

  constructor(app: App, ipc: TyperClient) {
    super(app);
    this.ipc = ipc;
    document.addEventListener("keydown", this.handleDigitSelect.bind(this));
  }

  private handleDigitSelect(evt: KeyboardEvent): void {
    if (!this.numberSelectionEnabled || !this.context) return;
    const key = evt.key;
    if (!/^[1-9]$/.test(key)) return;
    const idx = parseInt(key, 10) - 1;
    if (idx < 0 || idx >= this.lastSuggestions.length) return;
    const { editor, start, end } = this.context;
    const currentWord = editor.getRange(start, end);
    if (/\d/.test(currentWord)) return;
    evt.preventDefault();
    evt.stopPropagation();
    this.selectSuggestion(this.lastSuggestions[idx], evt);
    this.close();
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    console.log("TyperSuggest: onTrigger called", cursor, file?.path);
    this.selected = false;
    if (!file) return null;

    const line = editor.getLine(cursor.line);
    let start = cursor.ch;
    const end = cursor.ch;

    // move start back to the beginning of the word
    while (start > 0 && /[\w'-]/.test(line.charAt(start - 1))) {
      start--;
    }
    const currentWord = line.slice(start, end);
    console.log("TyperSuggest: currentWord", currentWord);
    
    if (hasOnlyNumbersOrSpecialChars(currentWord)) {
      return null;
    }

    if (
      !currentWord ||
      currentWord.length < this.minChars ||
      currentWord.length > this.maxChars
    ) {
      return null;
    }

    if (
      currentWord.toLowerCase() === this.lastWord &&
      this.lastSuggestions.length === 0
    ) {
      console.log("TyperSuggest: Skipping duplicate word", currentWord);
      return null;
    }

    // Save the word for cache and future comparisons
    this.lastWord = currentWord.toLowerCase();
    if (
      this.cachedSuggestions[this.lastWord] &&
      this.cachedSuggestions[this.lastWord].length > 0
    ) {
      const capitalizedIndexes = getCapitalizedIndexes(currentWord);
      this.lastSuggestions = this.cachedSuggestions[this.lastWord].map((s) => ({
        ...s,
        word: capitalizeWord(s.word, capitalizedIndexes),
      }));
      return {
        start: { line: cursor.line, ch: start },
        end: { line: cursor.line, ch: end },
        query: currentWord,
      };
    }

    return {
      start: { line: cursor.line, ch: start },
      end: { line: cursor.line, ch: end },
      query: currentWord,
    };
  }

  async getSuggestions(context: EditorSuggestContext): Promise<Suggestion[]> {
    console.log("TyperSuggest: getSuggestions called", context.query);
    return this.debouncedGetSuggestions(context);
  }

  private async debouncedGetSuggestions(
    context: EditorSuggestContext
  ): Promise<Suggestion[]> {
    console.log("TyperSuggest: debouncedGetSuggestions called", context.query);
    
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    return new Promise((resolve) => {
      this.debounceTimeout = setTimeout(async () => {
        if (
          context.query.length < this.minChars ||
          context.query.length > this.maxChars ||
          hasOnlyNumbersOrSpecialChars(context.query)
        ) {
          console.log("TyperSuggest: Query doesn't meet criteria", {
            length: context.query.length,
            minChars: this.minChars,
            maxChars: this.maxChars,
            hasOnlyNumbersOrSpecialChars: hasOnlyNumbersOrSpecialChars(context.query)
          });
          this.lastSuggestions = [];
          this.cachedSuggestions[context.query.toLowerCase()] = [];
          resolve([]);
          return;
        }

        const capitalizedIndexes = getCapitalizedIndexes(context.query);
        const lowerCaseQuery = context.query.toLowerCase();

        if (this.cachedSuggestions[lowerCaseQuery]) {
          this.lastSuggestions = this.cachedSuggestions[lowerCaseQuery]
            .filter(
              (s: Suggestion) =>
                s.word.toLowerCase() !== lowerCaseQuery.toLowerCase()
            )
            .map((s) => ({
              ...s,
              word: capitalizeWord(s.word, capitalizedIndexes),
            }));
          resolve(this.lastSuggestions);
          return;
        }

        try {
          const response = await this.ipc.getCompletions(
            lowerCaseQuery,
            this.fuzzyMatching,
            this.limit
          );

          // filter current word
          const suggestions = response.suggestions
            .filter(
              (s: Suggestion) =>
                s.word.toLowerCase() !== lowerCaseQuery.toLowerCase()
            )
            .map((s) => ({
              ...s,
              word: capitalizeWord(s.word, capitalizedIndexes),
            }));

          this.lastSuggestions = suggestions;
          this.cachedSuggestions[lowerCaseQuery] = response.suggestions;

          resolve(suggestions);
        } catch (error) {
          if (
            error === "Duplicate request" ||
            error === "Timeout waiting for completion response"
          ) {
            resolve(this.lastSuggestions);
          } else {
            console.error("Typer: Error fetching suggestions:", error);
            this.lastSuggestions = [];
            this.cachedSuggestions[context.query.toLowerCase()] = [];
            resolve([]);
          }
        }
      }, this.debounceDelay);
    });
  }

  renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
    console.log("TyperSuggest: renderSuggestion called", suggestion);
    
    const container = el.createDiv({ cls: "typer-suggestion-container" });

    const displayRank = this.lastSuggestions.indexOf(suggestion) + 1;
    const rankEl = container.createSpan({ cls: "typer-suggestion-rank" });
    if (displayRank > 0) {
      rankEl.setText(`${displayRank}`);
    }

    const contentEl = container.createSpan({ cls: "typer-suggestion-content" });
    contentEl.setText(suggestion.word);
  }

  selectSuggestion(
    suggestion: Suggestion,
    evt: MouseEvent | KeyboardEvent
  ): void {
    if (!this.context) return;

    const { editor, start, end } = this.context;
    const currentWord = editor.getRange(start, end);

    if (currentWord === suggestion.word) {
      this.selected = true;
      this.lastWord = "";
      return;
    }

    if (evt instanceof KeyboardEvent && !/\d/.test(currentWord)) {
      const key = evt.key;
      if (/^[1-9]$/.test(key)) {
        const index = parseInt(key) - 1;
        if (index < this.lastSuggestions.length) {
          evt.preventDefault();
          suggestion = this.lastSuggestions[index];
        }
      }
    }

    // replace and add a space
    editor.replaceRange(suggestion.word + " ", start, end);
    editor.setCursor({
      line: end.line,
      ch: start.ch + suggestion.word.length + 1,
    });

    this.selected = true;
    this.lastWord = "";
  }
}
