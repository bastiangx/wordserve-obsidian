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
import { AbbreviationManager } from "../core/abbrv";
import { CONFIG } from "../core/config";
import { Suggestion } from "../types";
import {
  capitalizeWord,
  getCapitalizedIndexes,
  hasOnlyNumbersOrSpecialChars,
} from "../utils/string";
import { keybindManager } from "../settings/keybinds";
import TyperPlugin from "../../main";
import { logger } from "../utils/logger";

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
  private selectedIndex: number = 0;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private client: TyperClient;
  private plugin: TyperPlugin;
  public abbreviationManager: AbbreviationManager;

  constructor(app: App, client: TyperClient, plugin: TyperPlugin) {
    super(app);
    this.client = client;
    this.plugin = plugin;
    this.abbreviationManager = new AbbreviationManager(app, plugin);
    document.addEventListener("keydown", this.handleKeybinds.bind(this));
  }

  navigateUp(): void {
    if (!this.context || this.lastSuggestions.length === 0) return;
    
    this.selectedIndex = this.selectedIndex > 0 
      ? this.selectedIndex - 1 
      : this.lastSuggestions.length - 1;
    
    this.updateSelectedSuggestion();
  }

  navigateDown(): void {
    if (!this.context || this.lastSuggestions.length === 0) return;
    
    this.selectedIndex = this.selectedIndex < this.lastSuggestions.length - 1 
      ? this.selectedIndex + 1 
      : 0;
    
    this.updateSelectedSuggestion();
  }

  private updateSelectedSuggestion(): void {
    // Update the visual selection in the suggestion menu
    const suggestionElements = document.querySelectorAll('.suggestion-item');
    suggestionElements.forEach((el, index) => {
      if (index === this.selectedIndex) {
        el.addClass('is-selected');
      } else {
        el.removeClass('is-selected');
      }
    });
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
    // Navigation (up/down)
    const navActions = [
      { action: "up", move: -1 },
      { action: "down", move: 1 },
    ];
    for (const nav of navActions) {
      if (keybindManager.getKeysForAction(nav.action as import("../settings/keybinds").KeybindAction).includes(evt.key)) {
        evt.preventDefault();
        evt.stopPropagation();
        
        if (nav.move > 0) {
          this.navigateDown();
        } else {
          this.navigateUp();
        }
        
        logger.debug(`Navigate ${nav.action} (${nav.move})`);
        return;
      }
    }
    // Select suggestion
    if (keybindManager.getKeysForAction("select").includes(evt.key)) {
      evt.preventDefault();
      evt.stopPropagation();
      
      if (this.lastSuggestions.length > 0) {
        this.selectSuggestion(this.lastSuggestions[this.selectedIndex], evt);
      }
      
      logger.debug("Select suggestion");
      return;
    }
    // Close menu
    if (keybindManager.getKeysForAction("close").includes(evt.key)) {
      evt.preventDefault();
      evt.stopPropagation();
      // TODO: Implement hotkey logging
      // logger.hotkey("Close menu", { key: evt.key });
      this.close();
      return;
    }
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    this.selected = false;
    this.selectedIndex = 0;
    if (!file) return null;

    const line = editor.getLine(cursor.line);
    let start = cursor.ch;
    const end = cursor.ch;

    // move start back to the beginning of the word
    while (start > 0 && /[\w'-]/.test(line.charAt(start - 1))) {
      start--;
    }
    const currentWord = line.slice(start, end);
    
    // Check for abbreviations first if enabled
    if (this.plugin.settings.abbreviationsEnabled && currentWord) {
      const abbreviationResult = this.abbreviationManager.checkForAbbreviation(line, cursor.ch);
      if (abbreviationResult) {
        const { abbreviation, start: abbrevStart, end: abbrevEnd } = abbreviationResult;
        
        // Use the expandAbbreviation method which handles logging and notifications
        const expandedText = this.abbreviationManager.expandAbbreviation(
          abbreviation.shortcut, 
          this.plugin.settings.abbreviationNotification
        );
        
        if (expandedText) {
          editor.replaceRange(expandedText + " ", 
            { line: cursor.line, ch: abbrevStart }, 
            { line: cursor.line, ch: abbrevEnd }
          );
          editor.setCursor({
            line: cursor.line,
            ch: abbrevStart + expandedText.length + 1
          });
        }
        return null; // Don't show suggestions
      }
    }
    
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

    // Skip if this is the same query we just processed (avoid duplicate triggers)
    if (
      currentWord.toLowerCase() === this.lastWord &&
      this.lastSuggestions.length === 0
    ) {
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
      this.selectedIndex = 0;
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
    logger.msgpack("TyperSuggest: getSuggestions called", context.query);
    return this.debouncedGetSuggestions(context);
  }

  private async debouncedGetSuggestions(
    context: EditorSuggestContext
  ): Promise<Suggestion[]> {
    logger.msgpack("TyperSuggest: debouncedGetSuggestions called", context.query);
    
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
          logger.msgpack("TyperSuggest: Query doesn't meet criteria", {
            length: context.query.length,
            minChars: this.minChars,
            maxChars: this.maxChars,
            hasOnlyNumbersOrSpecialChars: hasOnlyNumbersOrSpecialChars(context.query)
          });
          this.lastSuggestions = [];
          this.selectedIndex = 0;
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
          this.selectedIndex = 0;
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
          this.selectedIndex = 0;
          this.cachedSuggestions[lowerCaseQuery] = rawSuggestions;

          resolve(suggestions);
        } catch (error) {
          if (
            error === "Duplicate request" ||
            error === "Request timeout" ||
            (error instanceof Error && error.message === "Request already in progress")
          ) {
            // Silent handling - just return cached suggestions for concurrent requests
            resolve(this.lastSuggestions);
          } else {
            logger.error("Typer: Error fetching suggestions:", error);
            this.lastSuggestions = [];
            this.selectedIndex = 0;
            this.cachedSuggestions[context.query.toLowerCase()] = [];
            resolve([]);
          }
        }
      }, this.debounceDelay);
    });
  }

  renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
    // Add class for navigation selection
    el.addClass('suggestion-item');
    
    // Add selected class if this is the currently selected suggestion
    const suggestionIndex = this.lastSuggestions.indexOf(suggestion);
    if (suggestionIndex === this.selectedIndex) {
      el.addClass('is-selected');
    }
    // Log menu UI details without showing suggestion content
    logger.menu("Rendering suggestion UI", { 
      rank: suggestion.rank,
      numberSelectionEnabled: this.numberSelectionEnabled,
      showRankingOverride: this.showRankingOverride,
      containerClasses: el.className,
      currentLimit: this.limit
    });
    
    const container = el.createDiv({ cls: "typer-suggestion-container" });

    // Log container styling details for render debugging
    const computedStyle = window.getComputedStyle(container);
    logger.render("Container element styling", {
      className: container.className,
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
      fontFamily: computedStyle.fontFamily,
      padding: computedStyle.padding,
      position: { x: el.offsetLeft, y: el.offsetTop },
      size: { width: el.offsetWidth, height: el.offsetHeight }
    });

    const displayRank = this.lastSuggestions.indexOf(suggestion) + 1;
    const rankEl = container.createSpan({ cls: "typer-suggestion-rank" });
    
    if (displayRank > 0 && (this.numberSelectionEnabled || this.showRankingOverride)) {
      rankEl.setText(`${displayRank}`);
      
      // Log rank element styling
      const rankStyle = window.getComputedStyle(rankEl);
      logger.menu("Rank element styling", {
        displayed: true,
        rank: displayRank,
        backgroundColor: rankStyle.backgroundColor,
        color: rankStyle.color,
        fontSize: rankStyle.fontSize,
        width: rankStyle.width,
        height: rankStyle.height
      });
    } else {
      rankEl.style.display = "none";
      logger.menu("Rank element hidden", { 
        numberSelection: this.numberSelectionEnabled, 
        showOverride: this.showRankingOverride 
      });
    }

    const contentEl = container.createSpan({ cls: "typer-suggestion-content" });
    
    // Log content styling without showing actual content
    const contentStyle = window.getComputedStyle(contentEl);
    logger.render("Content element styling", {
      className: contentEl.className,
      textTransform: contentStyle.textTransform,
      color: contentStyle.color,
      fontWeight: contentStyle.fontWeight
    });
    
    // Highlight prefix with muted colors
    if (this.context && this.context.query) {
      const query = this.context.query;
      const word = suggestion.word;
      const queryLower = query.toLowerCase();
      const wordLower = word.toLowerCase();
      
      if (wordLower.startsWith(queryLower)) {
        // Split the word into prefix (matching query) and suffix (rest)
        const prefixLength = query.length;
        const prefix = word.substring(0, prefixLength);
        const suffix = word.substring(prefixLength);
        
        // Create spans for prefix and suffix with different styling
        const prefixSpan = contentEl.createSpan({ cls: "suggestion-prefix" });
        prefixSpan.setText(prefix);
        
        const suffixSpan = contentEl.createSpan({ cls: "suggestion-suffix" });
        suffixSpan.setText(suffix);
        
        // Log prefix/suffix styling
        const prefixStyle = window.getComputedStyle(prefixSpan);
        const suffixStyle = window.getComputedStyle(suffixSpan);
        logger.render("Prefix/suffix styling", {
          prefixColor: prefixStyle.color,
          suffixColor: suffixStyle.color,
          suffixFontWeight: suffixStyle.fontWeight,
          prefixLength: prefixLength,
          totalLength: word.length
        });
      } else {
        contentEl.setText(suggestion.word);
      }
    } else {
      // Fallback: if no context, just show the word normally
      contentEl.setText(suggestion.word);
    }
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
    const insertSpace = keybindManager.insertSpace;
    editor.replaceRange(suggestion.word + (insertSpace ? " " : ""), start, end);
    editor.setCursor({
      line: end.line,
      ch: start.ch + suggestion.word.length + (insertSpace ? 1 : 0),
    });

    this.selected = true;
    this.lastWord = "";
  }
}
