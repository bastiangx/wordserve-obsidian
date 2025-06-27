export interface TyperPluginSettings {
  minWordLength: number;
  maxSuggestions: number;
  debounceTime: number;
  numberSelection: boolean;
  showRankingOverride: boolean;
  keybindMode?: "default" | "macos" | "tabs" | "vim";
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

export interface ConfigUpdateRequest {
  max_limit?: number;
  min_prefix?: number;
  max_prefix?: number;
  enable_filter?: boolean;
}

export interface ConfigResponse {
  status: string;
  error?: string;
}

export type BackendResponse =
  | CompletionResponse
  | CompletionError
  | ConfigResponse;
