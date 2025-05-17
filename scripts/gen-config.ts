import * as fs from "fs";
import * as path from "path";
import * as toml from "@iarna/toml";

const tomlPath = path.resolve(__dirname, "../config.toml");
const tomlSrc  = fs.readFileSync(tomlPath, "utf-8");
const config   = toml.parse(tomlSrc);

const out = `// THIS FILE IS AUTO‐GENERATED — DO NOT EDIT
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
export const CONFIG: ConfigType = ${JSON.stringify(config, null, 2)};
`;
fs.writeFileSync(path.resolve(__dirname, "../src/config.ts"), out);
console.log("config.ts generated");