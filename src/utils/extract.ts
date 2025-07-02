import { Editor, EditorPosition } from "obsidian";

export interface CurrentWordContext {
  word: string;
  start: EditorPosition;
  end: EditorPosition;
  line: string;
}

/**
 * Extract the current word being typed at the cursor position
 */
export function getCurrentWord(editor: Editor, cursor: EditorPosition): CurrentWordContext | null {
  const line = editor.getLine(cursor.line);
  let start = cursor.ch;
  const end = cursor.ch;

  // Move start back to the beginning of the word
  while (start > 0 && /[\w'-]/.test(line.charAt(start - 1))) {
    start--;
  }
  
  const word = line.slice(start, end);
  
  if (!word) {
    return null;
  }

  return {
    word,
    start: { line: cursor.line, ch: start },
    end: { line: cursor.line, ch: end },
    line
  };
}

/**
 * Check if a word contains only numbers or special characters
 */
export function hasOnlyNumbersOrSpecialChars(word: string): boolean {
  return /^[\d\s\p{P}\p{S}]*$/u.test(word);
}

/**
 * Validate if a word is eligible for suggestions
 */
export function isWordEligible(word: string, minLength: number, maxLength: number): boolean {
  if (!word || word.trim().length < minLength || word.length > maxLength) {
    return false;
  }
  
  if (hasOnlyNumbersOrSpecialChars(word)) {
    return false;
  }
  
  return true;
}
