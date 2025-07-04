import { Editor, EditorPosition } from "obsidian";

export interface CurrentWordContext {
	word: string;
	start: EditorPosition;
	end: EditorPosition;
	line: string;
}

/** Extracts the current word being typed at the cursor position. */
export function getCurrentWord(editor: Editor, cursor: EditorPosition): CurrentWordContext | null {
	const line = editor.getLine(cursor.line);
	let start = cursor.ch;
	const end = cursor.ch;

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
		line,
	};
}

export function hasOnlyNumbersOrSpecialChars(word: string): boolean {
	return /^[\d\s\p{P}\p{S}]*$/u.test(word);
}

/** Checks if a word meets minimum length and content requirements for suggestions. */
export function isWordEligible(word: string, minLength: number, maxLength: number): boolean {
	if (!word || word.trim().length < minLength || word.length > maxLength) {
		return false;
	}

	if (hasOnlyNumbersOrSpecialChars(word)) {
		return false;
	}

	return true;
}
