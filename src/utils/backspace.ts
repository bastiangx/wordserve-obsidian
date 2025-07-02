import { Editor, EditorPosition, TFile } from "obsidian";

export interface SmartBackspaceState {
  lastCommittedWord: string;
  originalWord: string;
  commitPosition: EditorPosition;
  filePath: string;
}

export class SmartBackspace {
  private states: Map<string, SmartBackspaceState> = new Map();

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

  public canRestore(editor: Editor, currentPosition: EditorPosition, file: TFile | null = null): SmartBackspaceState | null {
    const filePath = file?.path || 'untitled';
    const key = this.getEditorKey(editor, currentPosition, filePath);
    const state = this.states.get(key);
    
    if (!state) return null;
    
    // Check if cursor is at the expected position (right after the committed word)
    if (currentPosition.line === state.commitPosition.line &&
        currentPosition.ch === state.commitPosition.ch &&
        state.filePath === filePath) {
      return state;
    }
    
    return null;
  }

  public restore(editor: Editor, state: SmartBackspaceState): void {
    const wordStart = {
      line: state.commitPosition.line,
      ch: state.commitPosition.ch - state.lastCommittedWord.length
    };
    
    // Replace the committed word with the original word
    editor.replaceRange(state.originalWord, wordStart, state.commitPosition);
    
    // Update cursor position
    const newCursor = {
      line: wordStart.line,
      ch: wordStart.ch + state.originalWord.length
    };
    editor.setCursor(newCursor);
    
    // Clean up the state
    const key = this.getEditorKey(editor, state.commitPosition, state.filePath);
    this.states.delete(key);
  }

  public clearState(editor: Editor, position: EditorPosition, file: TFile | null = null): void {
    const filePath = file?.path || 'untitled';
    const key = this.getEditorKey(editor, position, filePath);
    this.states.delete(key);
  }

  private getEditorKey(editor: Editor, position: EditorPosition, filePath: string): string {
    // Create a unique key using file path, line, and character position
    // This ensures uniqueness across different files and editor instances
    return `${filePath}:${position.line}:${position.ch}`;
  }
}

export const smartBackspace = new SmartBackspace();
