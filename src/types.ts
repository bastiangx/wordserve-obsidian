export interface TyperPluginSettings {
  minWordLength: number;
  maxSuggestions: number;
  fuzzyMatching: boolean;
  debounceTime: number;
  numberSelection: boolean;
}

export interface Suggestion {
  word: string;
  rank: number;
  freq?: number;
}

export interface CompletionResponse {
  suggestions: Suggestion[];
  count: number;
  prefix: string;
  time_ms: number;
  was_corrected?: boolean;
  corrected_prefix?: string;
}

export interface StatusResponse {
  status: string;
  requestId?: string;
}

export type BackendResponse = CompletionResponse | StatusResponse;
