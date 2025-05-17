// THIS FILE IS AUTO‐GENERATED FROM config.toml — DO NOT EDIT
// Type definitions (not auto-generated)
export interface PluginConfig {
  minWordLength: number;
  maxSuggestions: number;
  fuzzyMatching: boolean;
  debounceTime: number;
  numberSelection: boolean;
}

export interface InternalsConfig {
  maxChars: number;
  ghostHintOpacity: number;
}

export interface ConfigType {
  plugin: PluginConfig;
  internals: InternalsConfig;
}

// Auto-generated config values
export const CONFIG: ConfigType = {
  "plugin": {
    "minWordLength": 2,
    "maxSuggestions": 4,
    "fuzzyMatching": true,
    "debounceTime": 20,
    "numberSelection": true
  },
  "internals": {
    "maxChars": 10,
    "ghostHintOpacity": 0.5
  }
};
