import { EditorView } from "@codemirror/view";
import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
  Scope,
  MarkdownView,
} from "obsidian";
import { WordServeClient } from "../core/client";
import { AbbreviationManager } from "../core/abbrv";
import { CONFIG } from "../core/config";
import { Suggestion } from "../types";
import { capitalizeWord, getCapitalizedIndexes } from "../utils/string";
import { keybindManager } from "../settings/keybinds";
import { getCurrentWord, isWordEligible } from "../utils/extract";
import { setGhostText, clearGhostText } from "../editor/ghost";
import WordServePlugin from "../../main";
import { logger } from "../utils/logger";

interface EditorWithCM extends Editor {
  cm: EditorView;
}

interface SuggestionsContainer {
  containerEl: HTMLElement;
  setSelectedItem(index: number, event: Event | null): void;
}

interface EditorSuggestWithInternals extends EditorSuggest<Suggestion> {
  suggestions?: SuggestionsContainer;
}

/** Main suggestion interface  handles word completion and abbreviation expansion. */
export class WordServeSuggest extends EditorSuggest<Suggestion> {
  public minChars: number = CONFIG.plugin.minWordLength;
  public maxChars: number = CONFIG.internals.maxChars;
  public limit: number = CONFIG.plugin.maxSuggestions;
  public debounceDelay: number = CONFIG.plugin.debounceTime;
  public numberSelectionEnabled: boolean = CONFIG.plugin.numberSelection;
  public showRankingOverride: boolean = false;
  public smartBackspace: boolean = true;

  private lastWord = "";
  private lastSuggestions: Suggestion[] = [];
  private cachedSuggestions: Record<string, Suggestion[]> = {};
  private cacheAccessOrder: string[] = [];
  private maxCacheSize = 100;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private client: WordServeClient;
  private plugin: WordServePlugin;
  public abbreviationManager: AbbreviationManager;
  private requestCounter: number = 0;

  private currentWord: string = "";
  private selectedIndex: number = 0;
  private originalWordForBackspace: string = "";
  private lastCommittedWord: string = "";
  private lastCommittedPosition: EditorPosition | null = null;
  private lastCommittedWithSpace: boolean = false;
  private smartBackspaceEnabled: boolean = false;
  private observer: MutationObserver | null = null;
  private globalBackspaceHandler: ((evt: KeyboardEvent) => void) | null = null;
  private globalKeyHandler: ((evt: KeyboardEvent) => void) | null = null;

  constructor(app: App, client: WordServeClient, plugin: WordServePlugin) {
    super(app);
    this.client = client;
    this.plugin = plugin;
    this.abbreviationManager = new AbbreviationManager(app, plugin);
    this.registerKeybinds();
    try {
      this.observer = new MutationObserver((mutations) => {
        try {
          for (const mutation of mutations) {
            if (
              mutation.type === "attributes" &&
              mutation.attributeName === "class"
            ) {
              const target = mutation.target;
              if (
                target instanceof HTMLElement &&
                target.classList.contains("is-selected")
              ) {
                const suggestionsContainer = (
                  this as EditorSuggestWithInternals
                ).suggestions?.containerEl;
                if (
                  suggestionsContainer &&
                  target.parentElement === suggestionsContainer
                ) {
                  const index = Array.from(
                    suggestionsContainer.children
                  ).indexOf(target);
                  if (index !== -1 && this.selectedIndex !== index) {
                    this.selectedIndex = index;
                    this.updateGhostText();
                  }
                }
              }
            }
          }
        } catch (error) {
          logger.error("Error in MutationObserver callback:", error);
        }
      });
    } catch (error) {
      logger.error("Failed to create MutationObserver:", error);
      this.observer = null;
    }
    this.setupGlobalBackspaceHandler();
  }

  private registerKeybinds(useDynamicKeys: boolean = false): void {
    const selectKey = useDynamicKeys
      ? keybindManager.getKeysForAction("select")[0] || "Enter"
      : "Enter";
    const selectAndSpaceKey = useDynamicKeys
      ? keybindManager.getKeysForAction("select_and_space")[0] || "Tab"
      : "Tab";
    this.scope.register([], selectAndSpaceKey, this.handleKeybinds.bind(this));
    this.scope.register([], selectKey, this.handleKeybinds.bind(this));
    this.scope.register([], "ArrowUp", this.handleKeybinds.bind(this));
    this.scope.register([], "ArrowDown", this.handleKeybinds.bind(this));
    this.scope.register([], "Escape", this.handleKeybinds.bind(this));
    for (let i = 1; i <= 9; i++) {
      this.scope.register([], i.toString(), this.handleKeybinds.bind(this));
    }
  }

  private setupGlobalBackspaceHandler(): void {
    this.globalKeyHandler = (evt: KeyboardEvent) => {
      if (!this.smartBackspaceEnabled) return;
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView?.editor) return;
      const editor = activeView.editor;
      const cursor = editor.getCursor();
      // if this is backspace and we're at the expected position
      if (evt.key === "Backspace" && this.smartBackspace) {
        // For Enter insertion (no space): cursor should be at end of word
        // For Tab insertion (with space): cursor should be after the space
        const expectedCursorPos = this.lastCommittedWithSpace
          ? this.lastCommittedPosition!.ch + 1
          : this.lastCommittedPosition!.ch;
        if (
          this.lastCommittedPosition &&
          this.lastCommittedWord &&
          this.originalWordForBackspace &&
          cursor.line === this.lastCommittedPosition.line &&
          cursor.ch === expectedCursorPos
        ) {
          evt.preventDefault();
          evt.stopPropagation();
          const from = {
            line: this.lastCommittedPosition.line,
            ch: this.lastCommittedPosition.ch - this.lastCommittedWord.length,
          };
          const to = this.lastCommittedWithSpace
            ? {
                line: this.lastCommittedPosition.line,
                ch: this.lastCommittedPosition.ch + 1,
              }
            : this.lastCommittedPosition;
          editor.replaceRange(this.originalWordForBackspace, from, to);
          editor.setCursor({
            line: from.line,
            ch: from.ch + this.originalWordForBackspace.length,
          });
          this.clearSmartBackspaceState();
          return;
        }
      }
      if (evt.key !== "Backspace") {
        this.clearSmartBackspaceState();
      }
    };
    document.addEventListener("keydown", this.globalKeyHandler, true);
  }

  open(): void {
    super.open();
    if (
      (this as EditorSuggestWithInternals).suggestions?.containerEl &&
      this.observer
    ) {
      try {
        this.observer.observe(
          (this as EditorSuggestWithInternals).suggestions!.containerEl,
          {
            attributes: true,
            subtree: true,
            attributeFilter: ["class"],
          }
        );
      } catch (error) {
        logger.error("Failed to start MutationObserver:", error);
      }
    }
  }
  close(): void {
    super.close();
    if (this.observer) {
      try {
        this.observer.disconnect();
      } catch (error) {
        logger.error("Error disconnecting MutationObserver:", error);
      }
    }
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    if (this.context) {
      clearGhostText((this.context.editor as EditorWithCM).cm);
    }
  }

  /** Updates keybind scope when settings change */
  public updateKeybinds(): void {
    this.scope = new Scope();
    this.registerKeybinds(true);
  }

  private handleKeybinds(evt: KeyboardEvent): void {
    if (!this.context) return;
    if (evt.key === "Backspace" && this.smartBackspace) {
      const editor = this.context.editor;
      const cursor = editor.getCursor();
      if (
        this.lastCommittedPosition &&
        cursor.line === this.lastCommittedPosition.line &&
        cursor.ch === this.lastCommittedPosition.ch
      ) {
        evt.preventDefault();
        evt.stopPropagation();
        this.restoreFromCommittedWord();
        return;
      }
    }
    if (
      this.numberSelectionEnabled &&
      keybindManager.getKeysForAction("numberSelect").includes(evt.key)
    ) {
      const idx = parseInt(evt.key, 10) - 1;
      if (idx < 0 || idx >= this.lastSuggestions.length) return;
      evt.preventDefault();
      evt.stopPropagation();
      this.selectSuggestion(this.lastSuggestions[idx], evt);
      this.close();
      return;
    }
    if (keybindManager.getKeysForAction("up").includes(evt.key)) {
      evt.preventDefault();
      evt.stopPropagation();
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateGhostText();
      this.updateMenuSelection();
      return;
    }
    if (keybindManager.getKeysForAction("down").includes(evt.key)) {
      evt.preventDefault();
      evt.stopPropagation();
      this.selectedIndex = Math.min(
        this.lastSuggestions.length - 1,
        this.selectedIndex + 1
      );
      this.updateGhostText();
      this.updateMenuSelection();
      return;
    }
    if (
      keybindManager.getKeysForAction("select").includes(evt.key) ||
      keybindManager.getKeysForAction("select_and_space").includes(evt.key)
    ) {
      if (
        keybindManager.getKeysForAction("select_and_space").includes(evt.key) &&
        this.lastSuggestions.length === 0
      ) {
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      const suggestion = this.lastSuggestions[this.selectedIndex];
      if (suggestion) {
        this.selectSuggestion(suggestion, evt);
      }
      this.close();
      return;
    }
    if (keybindManager.getKeysForAction("close").includes(evt.key)) {
      evt.preventDefault();
      evt.stopPropagation();
      this.close();
      return;
    }
  }

  public handleSyntheticKeybind(evt: KeyboardEvent): void {
    this.handleKeybinds(evt);
  }

  private updateMenuSelection(): void {
    if ((this as EditorSuggestWithInternals).suggestions) {
      (this as EditorSuggestWithInternals).suggestions!.setSelectedItem(
        this.selectedIndex,
        null
      );
    }
  }

  private updateGhostText(): void {
    if (!this.context) return;
    if (!this.plugin.settings.ghostTextEnabled) {
      return;
    }
    const suggestion = this.lastSuggestions[this.selectedIndex];
    const currentWord = this.currentWord;
    const editor = this.context.editor as EditorWithCM;
    if (suggestion && currentWord && suggestion.word.startsWith(currentWord)) {
      const ghost = suggestion.word.substring(currentWord.length);
      requestAnimationFrame(() => {
        if (this.lastSuggestions.length > 0 && this.context) {
          const doc = editor.cm.state.doc;
          const line = doc.line(this.context.end.line + 1);
          const pos = line.from + this.context.end.ch;
          setGhostText(editor.cm, pos, ghost);
        }
      });
    } else {
      clearGhostText(editor.cm);
    }
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    this.selectedIndex = 0;
    const editorView = (editor as EditorWithCM).cm;
    if (!file) {
      clearGhostText(editorView);
      return null;
    }
    const wordContext = getCurrentWord(editor, cursor);
    if (!wordContext) {
      clearGhostText(editorView);
      return null;
    }
    const currentWord = wordContext.word;
    if (this.plugin.settings.abbreviationsEnabled && currentWord) {
      const line = editor.getLine(cursor.line);
      const abbreviationResult = this.abbreviationManager.checkForAbbreviation(
        line,
        cursor.ch
      );
      if (abbreviationResult) {
        const {
          abbreviation,
          start: abbrevStart,
          end: abbrevEnd,
        } = abbreviationResult;
        const expandedText = this.abbreviationManager.expandAbbreviation(
          abbreviation.shortcut,
          this.plugin.settings.abbreviationNotification
        );
        if (expandedText) {
          editor.replaceRange(
            expandedText + " ",
            { line: cursor.line, ch: abbrevStart },
            { line: cursor.line, ch: abbrevEnd }
          );
          editor.setCursor({
            line: cursor.line,
            ch: abbrevStart + expandedText.length + 1,
          });
        }
        clearGhostText(editorView);
        return null;
      }
    }
    if (!isWordEligible(currentWord, this.minChars, this.maxChars)) {
      logger.debug(`[WordServeSuggest] Word '${currentWord}' is not eligible.`);
      clearGhostText(editorView);
      return null;
    }
    if (
      currentWord.toLowerCase() === this.lastWord &&
      this.lastSuggestions.length === 0
    ) {
      clearGhostText(editorView);
      return null;
    }

    this.currentWord = currentWord;
    this.lastWord = currentWord.toLowerCase();
    clearGhostText((editor as EditorWithCM).cm);
    if (
      this.cachedSuggestions[this.lastWord] &&
      this.cachedSuggestions[this.lastWord].length > 0
    ) {
      const capitalizedIndexes = getCapitalizedIndexes(currentWord);
      this.lastSuggestions =
        this.getCachedSuggestions(this.lastWord)?.map((s) => ({
          ...s,
          word: capitalizeWord(s.word, capitalizedIndexes),
        })) || [];
    }
    return {
      start: wordContext.start,
      end: wordContext.end,
      query: currentWord,
    };
  }

  /** Fetches suggestions from core or abbreviation manager based on input context. */
  async getSuggestions(context: EditorSuggestContext): Promise<Suggestion[]> {
    logger.debug(
      `[WordServeSuggest] Getting suggestions for query: '${context.query}'`
    );
    if (!context.query || !context.query.trim()) {
      logger.debug(
        `[WordServeSuggest] Query is empty or whitespace, returning no suggestions.`
      );
      return [];
    }
    const suggestions = await this.debouncedGetSuggestions(context);
    this.lastSuggestions = suggestions;
    this.selectedIndex = 0;
    this.updateGhostText();
    return suggestions;
  }

  private debouncedGetSuggestions(
    context: EditorSuggestContext
  ): Promise<Suggestion[]> {
    return new Promise((resolve) => {
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
      }
      this.debounceTimeout = setTimeout(async () => {
        this.debounceTimeout = null;
        const query = context.query.toLowerCase();
        // cache first
        const cachedSuggestions = this.getCachedSuggestions(query);
        if (cachedSuggestions) {
          logger.debug(
            `[WordServeSuggest] Using cached suggestions for: '${query}'`
          );
          const capitalizedIndexes = getCapitalizedIndexes(context.query);
          const suggestions = cachedSuggestions.map((s) => ({
            ...s,
            word: capitalizeWord(s.word, capitalizedIndexes),
          }));
          resolve(suggestions);
          return;
        }
        this.requestCounter++;
        try {
          const suggestions = await this.client.getSuggestions(context.query);
          this.setCachedSuggestions(
            query,
            suggestions.map((s) => ({ ...s, word: s.word.toLowerCase() }))
          );
          const capitalizedIndexes = getCapitalizedIndexes(context.query);
          const capitalizedSuggestions = suggestions.map((s) => ({
            ...s,
            word: capitalizeWord(s.word, capitalizedIndexes),
          }));
          resolve(capitalizedSuggestions);
        } catch (error) {
          logger.error(
            `[WordServeSuggest] Error fetching suggestions for '${query}':`,
            error
          );
          resolve([]);
        }
      }, this.debounceDelay);
    });
  }

  renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
    el.addClass("suggestion-item");
    const container = el.createDiv({ cls: "wordserve-suggestion-container" });
    const displayRank = this.lastSuggestions.indexOf(suggestion) + 1;
    const rankEl = container.createSpan({ cls: "wordserve-suggestion-rank" });
    if (
      displayRank > 0 &&
      (this.numberSelectionEnabled || this.showRankingOverride)
    ) {
      rankEl.setText(`${displayRank}`);
    } else {
      rankEl.addClass("hidden");
    }
    const contentEl = container.createSpan({
      cls: "wordserve-suggestion-content",
    });
    if (this.context && this.context.query) {
      const query = this.context.query;
      const word = suggestion.word;
      if (word.toLowerCase().startsWith(query.toLowerCase())) {
        const prefix = word.substring(0, query.length);
        const suffix = word.substring(query.length);
        contentEl.createSpan({ cls: "suggestion-prefix", text: prefix });
        contentEl.createSpan({ cls: "suggestion-suffix", text: suffix });
      } else {
        contentEl.setText(suggestion.word);
      }
    } else {
      contentEl.setText(suggestion.word);
    }
  }

  /** Handles suggestion selection and applies word replacement or abbreviation expansion. */
  selectSuggestion(
    suggestion: Suggestion,
    evt: KeyboardEvent | MouseEvent
  ): void {
    if (!this.context) return;
    const editor = this.context.editor as EditorWithCM;
    clearGhostText(editor.cm);
    const insertSpace =
      evt instanceof KeyboardEvent &&
      keybindManager.getKeysForAction("select_and_space").includes(evt.key);
    const replacement = suggestion.word + (insertSpace ? " " : "");
    this.originalWordForBackspace = this.currentWord;
    this.lastCommittedWord = suggestion.word;

    editor.replaceRange(replacement, this.context.start, this.context.end);
    this.lastCommittedPosition = {
      line: this.context.start.line,
      ch: this.context.start.ch + suggestion.word.length,
    };
    this.lastCommittedWithSpace = insertSpace;
    editor.setCursor({
      ...this.lastCommittedPosition,
      ch: this.lastCommittedPosition.ch + (insertSpace ? 1 : 0),
    });
    this.smartBackspaceEnabled = true;
    this.lastWord = "";
  }

  private restoreFromCommittedWord(): void {
    if (!this.context || !this.lastCommittedWord || !this.lastCommittedPosition)
      return;
    const editor = this.context.editor;
    const from = {
      line: this.lastCommittedPosition.line,
      ch: this.lastCommittedPosition.ch - this.lastCommittedWord.length,
    };
    editor.replaceRange(
      this.originalWordForBackspace,
      from,
      this.lastCommittedPosition
    );
    editor.setCursor({
      line: from.line,
      ch: from.ch + this.originalWordForBackspace.length,
    });
    this.lastCommittedWord = "";
    this.lastCommittedPosition = null;
    this.originalWordForBackspace = "";
  }

  private getCachedSuggestions(query: string): Suggestion[] | null {
    if (this.cachedSuggestions[query]) {
      const index = this.cacheAccessOrder.indexOf(query);
      if (index > -1) {
        this.cacheAccessOrder.splice(index, 1);
      }
      this.cacheAccessOrder.push(query);
      return this.cachedSuggestions[query];
    }
    return null;
  }

  private setCachedSuggestions(query: string, suggestions: Suggestion[]): void {
    this.cachedSuggestions[query] = suggestions;
    // Update access order
    const index = this.cacheAccessOrder.indexOf(query);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
    this.cacheAccessOrder.push(query);
    while (this.cacheAccessOrder.length > this.maxCacheSize) {
      const oldestKey = this.cacheAccessOrder.shift();
      if (oldestKey) {
        delete this.cachedSuggestions[oldestKey];
      }
    }
  }

  private clearSmartBackspaceState(): void {
    this.smartBackspaceEnabled = false;
    this.lastCommittedWord = "";
    this.lastCommittedPosition = null;
    this.originalWordForBackspace = "";
    this.lastCommittedWithSpace = false;
  }

  public cleanup(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    if (this.observer) {
      try {
        this.observer.disconnect();
      } catch (error) {
        logger.error(
          "Error disconnecting MutationObserver during cleanup:",
          error
        );
      }
      this.observer = null;
    }
    if (this.globalBackspaceHandler) {
      document.removeEventListener(
        "keydown",
        this.globalBackspaceHandler,
        true
      );
      this.globalBackspaceHandler = null;
    }
    this.cachedSuggestions = {};
    this.cacheAccessOrder = [];
    this.lastSuggestions = [];
  }

  public clearAllGhostText(): void {
    if (this.context) {
      clearGhostText((this.context.editor as EditorWithCM).cm);
    }
  }
}
