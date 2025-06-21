export function hasOnlyNumbersOrSpecialChars(word: string): boolean {
  return !/[a-zA-Z]/.test(word);
}

export function hasNumbers(word: string): boolean {
  return /\d/.test(word);
}

export function isSpecialChar(char: string): boolean {
  return /[!@#$%^&*(),.?":{}|<>]/.test(char);
}

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

export function capitalizeFirstLetterOfEachWord(s: string): string {
  return s
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function capitalizeFirstLetter(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
