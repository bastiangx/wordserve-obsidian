export interface WordServePluginSettings {
  minWordLength: number;
  maxSuggestions: number;
  debounceTime: number;
  numberSelection: boolean;
  showRankingOverride: boolean;
  compactMode: boolean;
  fontSize: "smallest" | "smaller" | "small" | "editor" | "ui-small" | "ui-medium" | "ui-larger";
  fontWeight: "thin" | "extralight" | "light" | "normal" | "medium" | "semibold" | "bold" | "extrabold" | "black";
  debugMode: boolean;
  dictionarySize: number;
  abbreviationsEnabled: boolean;
  abbreviationNotification: boolean;
  autoInsertion: boolean;
  autoInsertionCommitMode: "space-commits" | "enter-only";
  smartBackspace: boolean;
  minPrefix: number;
  maxLimit: number;
  accessibility: {
    boldSuffix: boolean;
    uppercaseSuggestions: boolean;
    prefixColorIntensity: "normal" | "muted" | "faint" | "accent";
    ghostTextColorIntensity: "normal" | "muted" | "faint" | "accent";
  };
  debug: {
    msgpackData: boolean;
    menuRender: boolean;
    configChange: boolean;
    hotkeys: boolean;
    renderEvents: boolean;
    abbrEvents: boolean;
  };
  autorespawn: {
    enabled: boolean;
    requestThreshold: number;
    timeThresholdMinutes: number;
  };
}

export interface AbbreviationEntry {
  shortcut: string;
  target: string;
  created: number;
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
  id?: string;
  p: string; // prefix
  l?: number; // limit
}

export interface CompletionSuggestion {
  w: string; // word
  r: number; // rank
}

export interface CompletionResponse {
  id: string;
  s: CompletionSuggestion[]; // suggestions
  c: number; // count
  t: number; // time_taken (microseconds)
  suggestions?: Suggestion[];
}

export interface CompletionError {
  id: string;
  e: string; // message
  c: number; // code
}

// Config management types
export interface ConfigRequest {
  id?: string;
  action: "rebuild_config" | "get_config_path";
}

export interface ConfigResponse {
  id: string;
  status: string;
  error?: string;
  config_path?: string;
}

// Dictionary management types
export interface DictionaryRequest {
  id?: string;
  action: "get_info" | "set_size" | "get_options";
  chunk_count?: number;
}

export interface DictionarySizeOption {
  chunk_count: number;
  word_count: number;
  size_label: string;
}

export interface DictionaryResponse {
  id: string;
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
