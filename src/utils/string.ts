/** String utility functions for text processing and validation. */

export function getCapitalizedIndexes(word: string): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] >= "A" && word[i] <= "Z") {
      indexes.push(i);
    }
  }
  return indexes;
}

export function capitalizeWord(word: string, indexes: number[]): string {
  let capitalizedWord = "";
  for (let i = 0; i < word.length; i++) {
    if (indexes.includes(i)) {
      capitalizedWord += word[i].toUpperCase();
    } else {
      capitalizedWord += word[i];
    }
  }
  return capitalizedWord;
}

/** If a word contains only numbers and special characters */
export function hasOnlyNumbersOrSpecialChars(word: string): boolean {
  return !/[a-zA-Z]/.test(word);
}

/** If a word contains numbers */
export function hasNumbers(word: string): boolean {
  return /\d/.test(word);
}

/** If a character is a special character */
export function isSpecialChar(char: string): boolean {
  return /[!@#$%^&*(),.?":{}|<>]/.test(char);
}

/** Capitalizes the first letter of each word in a string */
export function capitalizeWords(s: string): string {
  return s
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Capitalizes only the first letter of a string */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
