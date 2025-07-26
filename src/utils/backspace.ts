import { Editor, EditorPosition, TFile } from "obsidian";

export interface SmartBackspaceState {
  lastCommittedWord: string;
  originalWord: string;
  commitPosition: EditorPosition;
  filePath: string;
}

/** Manages smart backspace functionality to restore original words after suggestion commits. */
export class SmartBackspace {
  private states: Map<string, SmartBackspaceState> = new Map();

  /** Records a word commit for potential restoration. */
  public recordCommit(
    editor: Editor,
    committedWord: string,
    originalWord: string,
    position: EditorPosition,
    file: TFile | null = null
  ): void {
    const filePath = file?.path || 'untitled';
    const key = this.getEditorKey(editor, position, filePath);
    this.states.set(key, {
      lastCommittedWord: committedWord,
      originalWord: originalWord,
      commitPosition: position,
      filePath: filePath
    });
  }

  /** Checks if smart backspace can restore at the current position. */
  public canRestore(editor: Editor, currentPosition: EditorPosition, file: TFile | null = null): SmartBackspaceState | null {
    const filePath = file?.path || 'untitled';
    const key = this.getEditorKey(editor, currentPosition, filePath);
    const state = this.states.get(key);

    if (!state) return null;

    if (currentPosition.line === state.commitPosition.line &&
      currentPosition.ch === state.commitPosition.ch &&
      state.filePath === filePath) {
      return state;
    }

    return null;
  }

  /** Restores the original word before suggestion commit. */
  public restore(editor: Editor, state: SmartBackspaceState): void {
    const wordStart = {
      line: state.commitPosition.line,
      ch: state.commitPosition.ch - state.lastCommittedWord.length
    };

    editor.replaceRange(state.originalWord, wordStart, state.commitPosition);

    const newCursor = {
      line: wordStart.line,
      ch: wordStart.ch + state.originalWord.length
    };
    editor.setCursor(newCursor);

    const key = this.getEditorKey(editor, state.commitPosition, state.filePath);
    this.states.delete(key);
  }

  /** Clears stored state for a specific editor position */
  public clearState(editor: Editor, position: EditorPosition, file: TFile | null = null): void {
    const filePath = file?.path || 'untitled';
    const key = this.getEditorKey(editor, position, filePath);
    this.states.delete(key);
  }

  /** Clears all stored backspace states */
  public clearAllStates(): void {
    this.states.clear();
  }

  /** Gets the number of stored backspace states */
  public getStateCount(): number {
    return this.states.size;
  }

  private getEditorKey(editor: Editor, position: EditorPosition, filePath: string): string {
    return `${filePath}:${position.line}:${position.ch}`;
  }
}

export const smartBackspace = new SmartBackspace();
