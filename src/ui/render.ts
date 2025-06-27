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
import { Suggestion } from "../types";
import {
  capitalizeWord,
  getCapitalizedIndexes,
  hasOnlyNumbersOrSpecialChars,
} from "../utils/string";
import { keybindManager } from "../settings/keybinds";

export class TyperSuggest extends EditorSuggest<Suggestion> {
  public minChars: number = CONFIG.plugin.minWordLength;
  public maxChars: number = CONFIG.internals.maxChars;
  public limit: number = CONFIG.plugin.maxSuggestions;
  public debounceDelay: number = CONFIG.plugin.debounceTime;
  public numberSelectionEnabled: boolean = CONFIG.plugin.numberSelection;
  public showRankingOverride: boolean = false;

  private lastWord = "";
  private lastSuggestions: Suggestion[] = [];
  private cachedSuggestions: Record<string, Suggestion[]> = {};
  private selected: boolean = false;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private client: TyperClient;

  constructor(app: App, client: TyperClient) {
    super(app);
    this.client = client;
    document.addEventListener("keydown", this.handleKeybinds.bind(this));
  }

  private handleKeybinds(evt: KeyboardEvent): void {
    if (!this.context) return;
    // Digit selection
    if (
      this.numberSelectionEnabled &&
      keybindManager.getKeysForAction("numberSelect").includes(evt.key)
    ) {
      const idx = parseInt(evt.key, 10) - 1;
      if (idx < 0 || idx >= this.lastSuggestions.length) return;
      const { editor, start, end } = this.context;
      const currentWord = editor.getRange(start, end);
      if (/\d/.test(currentWord)) return;
      evt.preventDefault();
      evt.stopPropagation();
      this.selectSuggestion(this.lastSuggestions[idx], evt);
      this.close();
      return;
    }
    // Navigation (up/down/tab etc)
    const navActions = [
      { action: "up", move: -1 },
      { action: "down", move: 1 },
      { action: "tabNext", move: 1 },
      { action: "tabPrev", move: -1 },
      { action: "macosUp", move: -1 },
      { action: "macosDown", move: 1 },
      { action: "vimUp", move: -1 },
      { action: "vimDown", move: 1 },
      { action: "vimAltUp", move: -1 },
      { action: "vimAltDown", move: 1 },
    ];
    for (const nav of navActions) {
      if (keybindManager.getKeysForAction(nav.action as import("../settings/keybinds").KeybindAction).includes(evt.key)) {
        evt.preventDefault();
        evt.stopPropagation();
        // TODO: Implement navigation logic (move selection up/down)
        // This requires tracking the selected index in the suggestion list
        // For now, just log
        console.log(`Navigate ${nav.action} (${nav.move})`);
        return;
      }
    }
    // Select suggestion
    if (keybindManager.getKeysForAction("select").includes(evt.key)) {
      evt.preventDefault();
      evt.stopPropagation();
      // TODO: Implement select logic (insert selected suggestion)
      // For now, just log
      console.log("Select suggestion");
      // this.selectSuggestion(...)
      return;
    }
    // Close menu
    if (keybindManager.getKeysForAction("close").includes(evt.key)) {
      evt.preventDefault();
      evt.stopPropagation();
      this.close();
      return;
    }
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
          const response = await this.client.getCompletions(
            lowerCaseQuery,
            this.limit
          );

          // Use the compatibility suggestions field
          const rawSuggestions = response.suggestions || [];
          
          // filter current word
          const suggestions = rawSuggestions
            .filter(
              (s: Suggestion) =>
                s.word.toLowerCase() !== lowerCaseQuery.toLowerCase()
            )
            .map((s) => ({
              ...s,
              word: capitalizeWord(s.word, capitalizedIndexes),
            }));

          this.lastSuggestions = suggestions;
          this.cachedSuggestions[lowerCaseQuery] = rawSuggestions;

          resolve(suggestions);
        } catch (error) {
          if (
            error === "Duplicate request" ||
            error === "Request timeout"
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
    if (displayRank > 0 && (this.numberSelectionEnabled || this.showRankingOverride)) {
      rankEl.setText(`${displayRank}`);
    } else {
      rankEl.style.display = "none";
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

    // replace and add a space if enabled
    const insertSpace = keybindManager.isInsertSpaceAfter();
    editor.replaceRange(suggestion.word + (insertSpace ? " " : ""), start, end);
    editor.setCursor({
      line: end.line,
      ch: start.ch + suggestion.word.length + (insertSpace ? 1 : 0),
    });

    this.selected = true;
    this.lastWord = "";
  }
}
