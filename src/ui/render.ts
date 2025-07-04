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
} from "obsidian";
import { TyperClient } from "../core/client";
import { AbbreviationManager } from "../core/abbrv";
import { CONFIG } from "../core/config";
import { Suggestion } from "../types";
import { capitalizeWord, getCapitalizedIndexes } from "../utils/string";
import { keybindManager } from "../settings/keybinds";
import { getCurrentWord, isWordEligible } from "../utils/extract";
import { setGhostText, clearGhostText } from "../editor/ghost-text-extension";
import TyperPlugin from "../../main";
import { logger } from "../utils/logger";

/** Main suggestion interface that handles word completion and abbreviation expansion. */
export class TyperSuggest extends EditorSuggest<Suggestion> {
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
  private debounceTimeout: NodeJS.Timeout | null = null;
  private client: TyperClient;
  private plugin: TyperPlugin;
  public abbreviationManager: AbbreviationManager;
  private requestCounter: number = 0;

  private currentWord: string = "";
  private selectedIndex: number = 0;
  private originalWordForBackspace: string = "";
  private lastCommittedWord: string = "";
  private lastCommittedPosition: EditorPosition | null = null;
  private observer: MutationObserver | null = null;

	constructor(app: App, client: TyperClient, plugin: TyperPlugin) {
		super(app);
		this.client = client;
		this.plugin = plugin;
		this.abbreviationManager = new AbbreviationManager(app, plugin);
		
		this.scope.register([], "Tab", this.handleKeybinds.bind(this));
		this.scope.register([], "Enter", this.handleKeybinds.bind(this));
		this.scope.register([], "ArrowUp", this.handleKeybinds.bind(this));
		this.scope.register([], "ArrowDown", this.handleKeybinds.bind(this));
		this.scope.register([], "Escape", this.handleKeybinds.bind(this));
		
		for (let i = 1; i <= 9; i++) {
			this.scope.register([], i.toString(), this.handleKeybinds.bind(this));
		}

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          const target = mutation.target as HTMLElement;
          if (target.classList.contains("is-selected")) {
            const suggestionsContainer = (this as any).suggestions?.containerEl;
            if (
              suggestionsContainer &&
              target.parentElement === suggestionsContainer
            ) {
              const index = Array.from(suggestionsContainer.children).indexOf(
                target
              );
              if (index !== -1 && this.selectedIndex !== index) {
                this.selectedIndex = index;
                this.updateGhostText();
              }
            }
          }
        }
      }
    });
  }

  open(): void {
    super.open();
    if ((this as any).suggestions?.containerEl) {
      this.observer?.observe((this as any).suggestions.containerEl, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class"],
      });
    }
  }

  close(): void {
    super.close();
    this.observer?.disconnect();
    if (this.context) {
      clearGhostText((this.context.editor as any).cm);
    }
  }

	/** Returns the last fetched suggestions for external access. */
  public getLastSuggestions(): Suggestion[] {
    return this.lastSuggestions;
  }

	/** Updates keybind scope when settings change to reflect new key mappings. */
	public updateKeybinds(): void {
		this.scope = new Scope();
		
		this.scope.register([], keybindManager.getKeysForAction("select")[0] || "Enter", this.handleKeybinds.bind(this));
		this.scope.register([], keybindManager.getKeysForAction("select_and_space")[0] || "Tab", this.handleKeybinds.bind(this));
		this.scope.register([], "ArrowUp", this.handleKeybinds.bind(this));
		this.scope.register([], "ArrowDown", this.handleKeybinds.bind(this));
		this.scope.register([], "Escape", this.handleKeybinds.bind(this));
		
		for (let i = 1; i <= 9; i++) {
			this.scope.register([], i.toString(), this.handleKeybinds.bind(this));
		}
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
        keybindManager
          .getKeysForAction("select_and_space")
          .includes(evt.key) &&
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

  private updateMenuSelection(): void {
    if ((this as any).suggestions) {
      (this as any).suggestions.setSelectedItem(this.selectedIndex, null);
    }
  }

  private updateGhostText(): void {
    if (!this.context) return;

    const suggestion = this.lastSuggestions[this.selectedIndex];
    const currentWord = this.currentWord;
    const editor = this.context.editor as any;

    if (suggestion && currentWord && suggestion.word.startsWith(currentWord)) {
      const ghost = suggestion.word.substring(currentWord.length);
      requestAnimationFrame(() => {
        if (this.lastSuggestions.length > 0 && this.context) {
          // Use the end position from context which should be correct
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

	/** Determines if suggestions should be shown based on cursor position and word context. */
	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile | null
	): EditorSuggestTriggerInfo | null {
		this.selectedIndex = 0;
		const editorView = (editor as any).cm as EditorView;

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
			logger.debug(`[TyperSuggest] Word '${currentWord}' is not eligible.`);
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
		clearGhostText((editor as any).cm);

		if (
			this.cachedSuggestions[this.lastWord] &&
			this.cachedSuggestions[this.lastWord].length > 0
		) {
			const capitalizedIndexes = getCapitalizedIndexes(currentWord);
			this.lastSuggestions = this.cachedSuggestions[this.lastWord].map((s) => ({
				...s,
				word: capitalizeWord(s.word, capitalizedIndexes),
			}));
		}

		return {
			start: wordContext.start,
			end: wordContext.end,
			query: currentWord,
		};
	}

	/** Fetches suggestions from backend or abbreviation manager based on input context. */
	async getSuggestions(context: EditorSuggestContext): Promise<Suggestion[]> {
		logger.debug(
			`[TyperSuggest] Getting suggestions for query: '${context.query}'`
		);
		if (!context.query || !context.query.trim()) {
			logger.debug(
				`[TyperSuggest] Query is empty or whitespace, returning no suggestions.`
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
				const query = context.query.toLowerCase();
				
				// Check cache first
				if (this.cachedSuggestions[query]) {
					logger.debug(`[TyperSuggest] Using cached suggestions for: '${query}'`);
					const capitalizedIndexes = getCapitalizedIndexes(context.query);
					const suggestions = this.cachedSuggestions[query].map((s) => ({
						...s,
						word: capitalizeWord(s.word, capitalizedIndexes),
					}));
					resolve(suggestions);
					return;
				}

				// Fetch from backend with request counting for optimization
				this.requestCounter++;
				try {
					const suggestions = await this.client.getSuggestions(context.query);
					
					// Cache the results
					this.cachedSuggestions[query] = suggestions;
					
					// Apply capitalization
					const capitalizedIndexes = getCapitalizedIndexes(context.query);
					const capitalizedSuggestions = suggestions.map((s) => ({
						...s,
						word: capitalizeWord(s.word, capitalizedIndexes),
					}));
					
					logger.debug(`[TyperSuggest] Fetched ${suggestions.length} suggestions for: '${query}' (request #${this.requestCounter})`);
					resolve(capitalizedSuggestions);
				} catch (error) {
					logger.error(`[TyperSuggest] Error fetching suggestions for '${query}':`, error);
					resolve([]);
				}
			}, this.debounceDelay);
		});
	}

	/** Renders individual suggestion items with rank indicators and styling. */
	renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
		el.addClass("suggestion-item");
		const container = el.createDiv({ cls: "typer-suggestion-container" });
		const displayRank = this.lastSuggestions.indexOf(suggestion) + 1;
		const rankEl = container.createSpan({ cls: "typer-suggestion-rank" });
		if (
			displayRank > 0 &&
			(this.numberSelectionEnabled || this.showRankingOverride)
		) {
			rankEl.setText(`${displayRank}`);
		} else {
			rankEl.style.display = "none";
		}

		const contentEl = container.createSpan({ cls: "typer-suggestion-content" });
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
		const editor = this.context.editor as any;
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
		editor.setCursor({
			...this.lastCommittedPosition,
			ch: this.lastCommittedPosition.ch + (insertSpace ? 1 : 0),
		});

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
}
