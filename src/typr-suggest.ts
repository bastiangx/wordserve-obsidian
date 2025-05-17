import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from "obsidian";
import { Suggestion, TyprIPC } from "./typr-ipc";
import { CONFIG } from "./config";

export class TyprSuggest extends EditorSuggest<Suggestion> {
  // Allow these public properties to be updated from settings
  public minChars: number = CONFIG.plugin.minWordLength;
  public maxChars: number = CONFIG.internals.maxChars;
  public limit: number = CONFIG.plugin.maxSuggestions;
  public debounceDelay: number = CONFIG.plugin.debounceTime;
  public numberSelectionEnabled: boolean = CONFIG.plugin.numberSelection;
  public fuzzyMatching: boolean = CONFIG.plugin.fuzzyMatching;
  
  private lastWord = "";
  private lastSuggestions: Suggestion[] = [];
  private cachedSuggestions: Record<string, Suggestion[]> = {};
  private selected = false;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private ghostHintEl: HTMLElement | null = null; // Declare ghostHintEl
  private ipc: TyprIPC;

  constructor(app: App, ipc: TyprIPC) {
    super(app);
    this.ipc = ipc;
    // Note: no need to set limit here - it's now derived from CONFIG
    // and will be updated by the main plugin
    
    // Listen for digit-key selection globally when suggestion UI is open
    document.addEventListener("keydown", this.handleDigitSelect.bind(this));
  }

  // Handler for digit key presses to select suggestions by number.
  private handleDigitSelect(evt: KeyboardEvent): void {
    if (!this.numberSelectionEnabled || !this.context) return;
    const key = evt.key;
    if (!/^[1-9]$/.test(key)) return;
    const idx = parseInt(key, 10) - 1;
    if (idx < 0 || idx >= this.lastSuggestions.length) return;
    // only allow if current word has no digits
    const { editor, start, end } = this.context;
    const currentWord = editor.getRange(start, end);
    if (/\d/.test(currentWord)) return;
    evt.preventDefault();
    evt.stopPropagation();
    // Select and insert the suggestion
    this.selectSuggestion(this.lastSuggestions[idx], evt);
    // Close the suggestion UI
    this.close();
  }

  // This method determines when to trigger the suggestion dropdown
  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    // Reset selection state immediately
    this.selected = false;

    if (!file) return null;

    // Get the current line of text
    const line = editor.getLine(cursor.line);

    // Find the word being typed before the cursor
    let start = cursor.ch;
    const end = cursor.ch;

    // Move start backward until we hit a non-word character or beginning of line
    while (start > 0 && /[\w'-]/.test(line.charAt(start - 1))) {
      start--;
    }

    // Current word being typed
    const currentWord = line.slice(start, end);

    // Don't show suggestions if the word consists only of numbers or special chars
    if (this.hasOnlyNumbersOrSpecialChars(currentWord)) {
      return null;
    }

    // Only trigger if the word is at least minChars but not too long
    if (
      !currentWord ||
      currentWord.length < this.minChars ||
      currentWord.length > this.maxChars
    ) {
      return null;
    }

    // Don't trigger for the same word we just processed
    if (currentWord === this.lastWord && this.lastSuggestions.length === 0) {
      return null;
    }

    this.lastWord = currentWord;

    // If we have cached suggestions for this word, use them immediately
    if (
      this.cachedSuggestions[currentWord] &&
      this.cachedSuggestions[currentWord].length > 0
    ) {
      this.lastSuggestions = this.cachedSuggestions[currentWord];
      // Return trigger info to show the suggestion UI
      return {
        start: { line: cursor.line, ch: start },
        end: { line: cursor.line, ch: end },
        query: currentWord,
      };
    }

    // Trigger the suggestion UI
    return {
      start: { line: cursor.line, ch: start },
      end: { line: cursor.line, ch: end },
      query: currentWord,
    };
  }

  // This method should return the suggestions to be displayed in the dropdown
  async getSuggestions(context: EditorSuggestContext): Promise<Suggestion[]> {
    return this.debouncedGetSuggestions(context);
  }

  // Debounced method to fetch suggestions
  private async debouncedGetSuggestions(
    context: EditorSuggestContext
  ): Promise<Suggestion[]> {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    return new Promise((resolve) => {
      this.debounceTimeout = setTimeout(async () => {
        if (
          context.query.length < this.minChars ||
          context.query.length > this.maxChars ||
          this.hasOnlyNumbersOrSpecialChars(context.query)
        ) {
          this.lastSuggestions = [];
          this.cachedSuggestions[context.query] = [];
          this.clearGhostHint();
          resolve([]);
          return;
        }

        // Use cache if available and not forced
        if (this.cachedSuggestions[context.query]) {
          this.lastSuggestions = this.cachedSuggestions[context.query].filter(
            (s: Suggestion) =>
              s.word.toLowerCase() !== context.query.toLowerCase()
          );
          if (this.lastSuggestions.length > 0) {
            // Temporarily disable ghost hint until editor API issues are resolved
            // this.showGhostHint(context.editor, context.query, this.lastSuggestions[0].word);
          } else {
            this.clearGhostHint();
          }
          resolve(this.lastSuggestions);
          return;
        }

        try {
          // Correct order of arguments for getCompletions
          const response = await this.ipc.getCompletions(
            context.query,
            this.fuzzyMatching, // fuzzy matching
            this.limit // limit for suggestions
          );

          // Filter out exact matches
          const suggestions = response.suggestions.filter(
            (s: Suggestion) =>
              s.word.toLowerCase() !== context.query.toLowerCase()
          );

          this.lastSuggestions = suggestions;
          this.cachedSuggestions[context.query] = suggestions;

          if (suggestions.length > 0) {
            // Temporarily disable ghost hint until editor API issues are resolved
            // this.showGhostHint(context.editor, context.query, suggestions[0].word);
          } else {
            this.clearGhostHint();
          }
          resolve(suggestions);
        } catch (error) {
          console.error("Typr: Error fetching suggestions:", error);
          this.lastSuggestions = [];
          this.cachedSuggestions[context.query] = [];
          this.clearGhostHint();
          resolve([]);
        }
      }, this.debounceDelay);
    });
  }

  // This method renders each suggestion item in the dropdown
  renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
    // Add container for proper styling
    const container = el.createDiv({ cls: "typr-suggestion-container" });

    // Add number (rank) indicator
    const displayRank = this.lastSuggestions.indexOf(suggestion) + 1;
    const rankEl = container.createSpan({ cls: "typr-suggestion-rank" });
    // Ensure rank is displayed only if positive (i.e., suggestion was found in lastSuggestions)
    if (displayRank > 0) {
      rankEl.setText(`${displayRank}`);
    }

    // Add suggestion text
    const contentEl = container.createSpan({ cls: "typr-suggestion-content" });
    contentEl.setText(suggestion.word);
  }

  // This method is called when a suggestion is selected from the dropdown
  selectSuggestion(
    suggestion: Suggestion,
    evt: MouseEvent | KeyboardEvent
  ): void {
    if (!this.context) return;

    const { editor, start, end } = this.context;
    const currentWord = editor.getRange(start, end);

    // If current word exactly matches the suggestion, don't replace it
    if (currentWord === suggestion.word) {
      this.selected = true;
      this.clearGhostHint();
      this.lastWord = "";
      return;
    }

    // If the word does not contain numbers and this is a keyboard event,
    // check if a number key was pressed to select a specific suggestion
    if (evt instanceof KeyboardEvent && !/\d/.test(currentWord)) {
      const key = evt.key;
      if (/^[1-9]$/.test(key)) {
        const index = parseInt(key) - 1;
        if (index < this.lastSuggestions.length) {
          // Key number matches a suggestion - prevent default key insertion
          evt.preventDefault();
          suggestion = this.lastSuggestions[index];
        }
      }
    }

    // Replace the current word with the selected suggestion and add a space
    editor.replaceRange(suggestion.word + " ", start, end);

    // Move the cursor after the inserted space
    editor.setCursor({
      line: end.line,
      ch: start.ch + suggestion.word.length + 1,
    });

    // Mark as selected so we don't immediately retrigger
    this.selected = true;

    // Clear any existing ghost hint
    this.clearGhostHint();

    // Reset cached suggestions for this word
    this.lastWord = "";
  }

  // Show a ghost hint with the first suggestion
  showGhostHint(editor: Editor, word: string, suggestion: string): void {
    if (!editor || !suggestion || suggestion === word) return;

    // Clear any existing hint
    this.clearGhostHint();

    // Create the ghost hint element if it doesn't exist
    if (!this.ghostHintEl) {
      this.ghostHintEl = document.createElement("span");
      this.ghostHintEl.className = "typr-ghost-hint";

      // Apply styling
      this.ghostHintEl.style.position = "absolute";
      this.ghostHintEl.style.opacity = "0.5";
      this.ghostHintEl.style.pointerEvents = "none";

      // Append to editor container - This part is problematic
      // const editorView = editor.cm as CodeMirror.EditorView; // This is an example, actual API might differ
      // if (editorView && editorView.scrollDOM) {
      //   editorView.scrollDOM.appendChild(this.ghostHintEl);
      // } else {
      //   console.warn("Typr: Could not find editor element to append ghost hint.");
      //   return;
      // }
    }

    // Get cursor position and set hint text - This part is problematic
    // const cursor = editor.getCursor();
    // const coords = editor.coordsAtPos(cursor.line, cursor.ch); // This method might not exist or work as expected

    // if (coords) {
    //   this.ghostHintEl.style.left = `${coords.left}px`;
    //   this.ghostHintEl.style.top = `${coords.top}px`;
    //   this.ghostHintEl.textContent = suggestion.substring(word.length);
    //   this.ghostHintEl.style.display = 'block';
    // } else {
    //   this.clearGhostHint();
    // }
    // Temporarily disable the core logic of showGhostHint due to API issues
    console.log(
      "Typr: showGhostHint called, but core logic is temporarily disabled."
    );
  }

  // Clear the ghost hint
  clearGhostHint(): void {
    if (this.ghostHintEl) {
      // this.ghostHintEl.style.display = 'none';
      // this.ghostHintEl.textContent = '';
      // if (this.ghostHintEl.parentElement) {
      //   this.ghostHintEl.parentElement.removeChild(this.ghostHintEl);
      // }
      // this.ghostHintEl = null;
      // Temporarily disable the core logic of clearGhostHint
      console.log(
        "Typr: clearGhostHint called, but core logic is temporarily disabled."
      );
    }
  }

  private hasOnlyNumbersOrSpecialChars(word: string): boolean {
    // Check if the word contains any letters
    return !/[a-zA-Z]/.test(word);
  }

  private hasNumbers(word: string): boolean {
    return /\d/.test(word);
  }

  private isSpecialChar(char: string): boolean {
    // Add any other special characters you want to ignore
    return /[!@#$%^&*(),.?":{}|<>]/.test(char);
  }
}
