export interface TyperPluginSettings {
  minWordLength: number;
  maxSuggestions: number;
  debounceTime: number;
  numberSelection: boolean;
  showRankingOverride: boolean;
  compactMode: boolean;
  fontSize: "smallest" | "smaller" | "small" | "editor" | "ui-small" | "ui-medium" | "ui-larger";
  fontWeight: "thin" | "extralight" | "light" | "normal" | "medium" | "semibold" | "bold" | "extrabold" | "black";
  debugMode: boolean;
  dictionarySize: number; // Number of chunks to load
  abbreviationsEnabled: boolean;
  abbreviationNotification: boolean;
  accessibility: {
    boldSuffix: boolean;
    uppercaseSuggestions: boolean;
    prefixColorIntensity: "normal" | "muted" | "faint" | "accent";
  };
  debug: {
    msgpackData: boolean;
    menuRender: boolean;
    configChange: boolean;
    hotkeys: boolean;
    renderEvents: boolean;
    abbrEvents: boolean;
  };
}

export interface AbbreviationEntry {
  shortcut: string;
  target: string;
  created: number; // timestamp
}

export interface AbbreviationMap {
  [shortcut: string]: AbbreviationEntry;
}

export interface Suggestion {
  word: string;
  rank: number;
}

// MessagePack types
export interface CompletionRequest {
  p: string; // prefix
  l?: number; // limit
}

export interface CompletionSuggestion {
  w: string; // word
  r: number; // rank
}

export interface CompletionResponse {
  s: CompletionSuggestion[]; // suggestions
  c: number; // count
  t: number; // time_taken (microseconds)
  suggestions?: Suggestion[];
}

export interface CompletionError {
  e: string; // message
  c: number; // code
}

export interface ConfigResponse {
  status: string;
  error?: string;
  available_chunks?: number;
}

// Dictionary management types
export interface DictionaryRequest {
  action: "get_info" | "set_size" | "get_options";
  chunk_count?: number;
}

export interface DictionarySizeOption {
  chunk_count: number;
  word_count: number;
  size_label: string;
}

export interface DictionaryResponse {
  status: string;
  error?: string;
  current_chunks?: number;
  available_chunks?: number;
  options?: DictionarySizeOption[];
}

export type BackendResponse =
  | CompletionResponse
  | CompletionError
  | ConfigResponse
  | DictionaryResponse;
