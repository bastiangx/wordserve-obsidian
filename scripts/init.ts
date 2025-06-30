import * as fs from "fs";
import * as path from "path";
import * as toml from "@iarna/toml";

const tomlPath = path.resolve(__dirname, "../defaults.toml");
const tomlSrc = fs.readFileSync(tomlPath, "utf-8");
const config = toml.parse(tomlSrc) as any;

// Ensure showRankingOverride is present in config.plugin
if (!("showRankingOverride" in config.plugin)) {
  config.plugin.showRankingOverride = false;
}

// Ensure compactMode is present in config.plugin
if (!("compactMode" in config.plugin)) {
  config.plugin.compactMode = true;
}

// Ensure fontSize is present in config.plugin
if (!("fontSize" in config.plugin)) {
  config.plugin.fontSize = "editor";
}

// Ensure fontWeight is present in config.plugin
if (!("fontWeight" in config.plugin)) {
  config.plugin.fontWeight = "normal";
}

// Ensure accessibility config exists
if (!("accessibility" in config)) {
  config.accessibility = {
    boldSuffix: false,
    uppercaseSuggestions: false,
    prefixColorIntensity: "faint",
  };
}

// Ensure debug config exists
if (!("debug" in config)) {
  config.debug = {
    msgpackData: false,
    menuRender: false,
    configChange: false,
    hotkeys: false,
    renderEvents: false,
  };
}

// Ensure abbreviations config exists
if (!("abbreviations" in config)) {
  config.abbreviations = {
    maxShortcutLength: 10,
    maxTargetLength: 4294967295,
    showNotification: false,
  };
}

// Ensure showNotification is present in abbreviations config
if (!("showNotification" in config.abbreviations)) {
  config.abbreviations.showNotification = false;
}

// Ensure abbreviationsEnabled is present in plugin config
if (!("abbreviationsEnabled" in config.plugin)) {
  config.plugin.abbreviationsEnabled = false;
}

// Ensure abbreviationNotification is present in plugin config
if (!("abbreviationNotification" in config.plugin)) {
  config.plugin.abbreviationNotification = false;
}

const configOut = `// THIS FILE IS AUTO‐GENERATED — DO NOT EDIT
import { TyperPluginSettings } from "../types";

export interface PluginConfig {
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
}

export interface InternalsConfig {
  maxChars: number;
}

export interface LimitsConfig {
  minWordLength: { min: number; max: number };
  maxSuggestions: { min: number; max: number };
  debounceTime: { min: number; max: number };
}

export interface StyleConfig {
    padding: string;
    compact_padding: string;
    rank_size: number;
    compact_rank_size: number;
    rank_border_radius: string;
    rank_margin_right: number;
    compact_rank_margin_right: number;
    rank_bg_opacity: number;
    rank_font_size: number;
    compact_rank_font_size: number;
    selected_rank_bg_opacity: number;
}

export interface KeybindsConfig {
  up: string[];
  down: string[];
  select: string[];
  close: string[];
  numberSelect: string[];
  tabNext: string[];
  tabPrev: string[];
  macosUp: string[];
  macosDown: string[];
  vimUp: string[];
  vimDown: string[];
  vimAltUp: string[];
  vimAltDown: string[];
  insertSpaceAfter: boolean;
}

export interface KeybindModesConfig {
  available: string[];
  default: string;
}

export interface AccessibilityConfig {
  boldSuffix: boolean;
  uppercaseSuggestions: boolean;
  prefixColorIntensity: "normal" | "muted" | "faint" | "accent" ;
}

export interface DebugConfig {
  msgpackData: boolean;
  menuRender: boolean;
  configChange: boolean;
  hotkeys: boolean;
  renderEvents: boolean;
  abbrEvents: boolean;
}

export interface AbbreviationsConfig {
  maxShortcutLength: number;
  maxTargetLength: number;
  showNotification: boolean;
}

export interface ConfigType {
  plugin: PluginConfig;
  internals: InternalsConfig;
  limits: LimitsConfig;
  style: StyleConfig;
  keybinds: KeybindsConfig;
  keybind_modes: KeybindModesConfig;
  accessibility: AccessibilityConfig;
  debug: DebugConfig;
  abbreviations: AbbreviationsConfig;
}

// Auto-generated config values
export const CONFIG: ConfigType = ${JSON.stringify(config, null, 2)};

export const DEFAULT_SETTINGS: TyperPluginSettings = {
  minWordLength: CONFIG.plugin.minWordLength,
  maxSuggestions: CONFIG.plugin.maxSuggestions,
  debounceTime: CONFIG.plugin.debounceTime,
  numberSelection: CONFIG.plugin.numberSelection,
  showRankingOverride: CONFIG.plugin.showRankingOverride,
  compactMode: CONFIG.plugin.compactMode,
  fontSize: CONFIG.plugin.fontSize,
  fontWeight: CONFIG.plugin.fontWeight,
  accessibility: CONFIG.accessibility,
  debugMode: CONFIG.plugin.debugMode,
  debug: CONFIG.debug,
  dictionarySize: CONFIG.plugin.dictionarySize,
  abbreviationsEnabled: CONFIG.plugin.abbreviationsEnabled,
  abbreviationNotification: CONFIG.plugin.abbreviationNotification,
};
`;
fs.writeFileSync(path.resolve(__dirname, "../src/core/config.ts"), configOut);
console.log("config.ts generated");

const s = config.style;
const cssOut = `/* THIS FILE IS AUTOGENERATED via scripts/ */

/* Suggestions dropdown */
.typer-suggestion-container {
  display: flex;
  align-items: center;
  padding: ${s.padding};
  cursor: pointer;
  font-family: var(--font-text), var(--font-text-theme),
    var(--font-monospace),var(--font-monospace-theme), sans-serif, serif, monospace ;
}

.typer-suggestion-rank {
  display: inline-block;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 12%;
  margin-right: 8px;

  background-color: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
  color: var(--text-normal); 

  font-size: 0.8em;
  text-align: center;
  line-height: 18px;
}

.typer-suggestion-content {
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Selected suggestion */
.suggestion-item.is-selected .typer-suggestion-rank {
  background-color: color-mix(in srgb, var(--interactive-accent) 30%, transparent);
  color: var(--text-normal);  // Use consistent color
}

/* Prefix highlighting */
.suggestion-prefix {
  color: var(--text-faint);
}

.suggestion-suffix {
  color: var(--text-normal);
}

/* Compact mode */
body.typer-compact-mode .typer-suggestion-container {
  padding: ${s.compact_padding};
}

body.typer-compact-mode .typer-suggestion-rank {
  width: ${s.compact_rank_size}px;
  height: ${s.compact_rank_size}px;
  margin-right: ${s.compact_rank_margin_right}px;
  font-size: ${s.compact_rank_font_size}px;
  line-height: ${s.compact_rank_size}px;
}

/* Accessibility - Bold suffix */
body.typer-bold-suffix .suggestion-suffix {
  font-weight: bold;
}

/* Accessibility - Uppercase suggestions */
body.typer-uppercase .typer-suggestion-content {
  text-transform: uppercase;
}

/* Accessibility - Prefix color variants */
body.typer-prefix-normal .suggestion-prefix {
  color: var(--text-normal);
}

body.typer-prefix-muted .suggestion-prefix {
  color: var(--text-muted);
}

body.typer-prefix-faint .suggestion-prefix {
  color: var(--text-faint);
}

body.typer-prefix-accent .suggestion-prefix {
  color: var(--text-accent);
}

/* Font Size Options */
body.typer-font-smallest .typer-suggestion-container {
  font-size: var(--font-smallest);
}

body.typer-font-smaller .typer-suggestion-container {
  font-size: var(--font-smaller);
}

body.typer-font-small .typer-suggestion-container {
  font-size: var(--font-small);
}

body.typer-font-editor .typer-suggestion-container {
  font-size: var(--font-text-size);
}

body.typer-font-ui-small .typer-suggestion-container {
  font-size: var(--font-ui-small);
}

body.typer-font-ui-medium .typer-suggestion-container {
  font-size: var(--font-ui-medium);
}

body.typer-font-ui-larger .typer-suggestion-container {
  font-size: var(--font-ui-larger);
}

/* Font Weight Options */
body.typer-weight-thin .typer-suggestion-container {
  font-weight: var(--font-thin);
}

body.typer-weight-extralight .typer-suggestion-container {
  font-weight: var(--font-extralight);
}

body.typer-weight-light .typer-suggestion-container {
  font-weight: var(--font-light);
}

body.typer-weight-normal .typer-suggestion-container {
  font-weight: var(--font-normal);
}

body.typer-weight-medium .typer-suggestion-container {
  font-weight: var(--font-medium);
}

body.typer-weight-semibold .typer-suggestion-container {
  font-weight: var(--font-semibold);
}

body.typer-weight-bold .typer-suggestion-container {
  font-weight: var(--font-bold);
}

body.typer-weight-extrabold .typer-suggestion-container {
  font-weight: var(--font-extrabold);
}

body.typer-weight-black .typer-suggestion-container {
  font-weight: var(--font-black);
}

/* Live Preview Styles */
.typer-preview-container {
  margin: 20px 0;
  padding: 16px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  background: var(--background-secondary);
}

.typer-preview-header {
  margin-bottom: 12px;
}

.typer-preview-title {
  font-weight: 600;
  color: var(--text-normal);
  font-size: 14px;
  display: block;
  margin-bottom: 4px;
}

.typer-preview-description {
  color: var(--text-muted);
  font-size: 12px;
  display: block;
}

.typer-preview-input-container {
  position: relative;
  margin-bottom: 8px;
}

.typer-preview-input {
  width: 100%;
  min-height: 32px;
  padding: 8px 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: var(--font-text);
  font-size: 14px;
  resize: none;
  overflow: hidden;
}

.typer-preview-input:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.typer-preview-suggestions {
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  box-shadow: var(--shadow-s);
  max-height: calc(4 * 40px); /* Space for 4 suggestion items */
  overflow: hidden;
  display: block; /* Always visible */
}

.typer-preview-suggestion-item {
  border-bottom: 1px solid var(--background-modifier-border-hover);
}

.typer-preview-suggestion-item:last-child {
  border-bottom: none;
}

.typer-preview-suggestion-item:hover {
  background: var(--background-modifier-hover);
}

/* Compact mode adjustments for preview */
body.typer-compact-mode .typer-preview-suggestions {
  max-height: calc(4 * 32px); /* Smaller space for compact mode */
}

/* Empty rows styling */
.typer-preview-empty-row {
  opacity: 0.3;
}

.typer-preview-empty-row .typer-suggestion-container {
  color: var(--text-faint);
}

/* Abbreviation Dialog Styles */
.typer-abbreviation-dialog .modal {
  width: 700px !important;
  max-width: 90vw !important;
  height: 600px !important;
  max-height: 80vh !important;
}

.typer-abbreviation-dialog .modal-content {
  padding: 20px !important;
  display: flex !important;
  flex-direction: column !important;
  height: 100% !important;
}

.typer-abbreviation-dialog h2 {
  margin: 0 0 20px 0 !important;
  font-size: 1.5em !important;
  font-weight: 600 !important;
  color: var(--text-normal) !important;
}

/* Controls Section */
.typer-controls-container {
  display: flex !important;
  gap: 20px !important;
  align-items: flex-end !important;
  margin-bottom: 20px !important;
  padding-bottom: 15px !important;
  border-bottom: 1px solid var(--background-modifier-border) !important;
}

.typer-search-container,
.typer-sort-container {
  display: flex !important;
  flex-direction: column !important;
  gap: 5px !important;
}

.typer-search-container {
  flex: 1 !important;
}

.typer-search-container label,
.typer-sort-container label {
  font-size: 0.9em !important;
  font-weight: 500 !important;
  color: var(--text-muted) !important;
}

.typer-search-container input {
  padding: 8px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
}

.typer-sort-container select {
  padding: 8px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  min-width: 150px !important;
}

/* Add Button */
.typer-add-button-container {
  margin-bottom: 20px !important;
}

.typer-add-button-container button {
  background: var(--interactive-accent) !important;
  color: var(--text-on-accent) !important;
  border: none !important;
  padding: 10px 20px !important;
  border-radius: 6px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  transition: background-color 0.2s !important;
}

.typer-add-button-container button:hover {
  background: var(--interactive-accent-hover) !important;
}

/* Entries Container */
.typer-entries-container {
  flex: 1 !important;
  overflow-y: auto !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 6px !important;
  padding: 10px !important;
  background: var(--background-secondary) !important;
}

/* Entry Rows */
.typer-entry-row {
  display: flex !important;
  gap: 15px !important;
  padding: 15px !important;
  margin-bottom: 15px !important;
  background: var(--background-primary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 6px !important;
  align-items: flex-start !important;
}

.typer-entry-row:last-child {
  margin-bottom: 0 !important;
}

.typer-entry-new {
  border-color: var(--interactive-accent) !important;
  background: var(--background-primary-alt) !important;
}

/* Entry Fields */
.typer-entry-fields {
  flex: 1 !important;
  display: grid !important;
  grid-template-columns: 200px 1fr !important;
  gap: 15px !important;
  align-items: flex-start !important;
}

.typer-shortcut-container,
.typer-target-container {
  display: flex !important;
  flex-direction: column !important;
}

.typer-shortcut-container input {
  padding: 8px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  font-family: var(--font-monospace) !important;
}

.typer-target-container textarea {
  padding: 8px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  font-family: var(--font-text) !important;
  min-height: 80px !important;
  resize: vertical !important;
}

/* Entry Actions */
.typer-entry-actions {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  min-width: 80px !important;
}

.typer-entry-actions button {
  padding: 6px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  cursor: pointer !important;
  font-size: 0.9em !important;
  transition: all 0.2s !important;
}

.typer-entry-actions button:hover {
  background: var(--background-modifier-hover) !important;
}

.typer-entry-actions button.mod-warning {
  color: var(--text-error) !important;
  border-color: var(--text-error) !important;
}

.typer-entry-actions button.mod-warning:hover {
  background: var(--background-modifier-error) !important;
  color: var(--text-normal) !important;
}

.typer-entry-actions button.mod-cta {
  background: var(--interactive-accent) !important;
  color: var(--text-on-accent) !important;
  border-color: var(--interactive-accent) !important;
}

.typer-entry-actions button.mod-cta:hover {
  background: var(--interactive-accent-hover) !important;
}

/* No entries message */
.typer-no-entries {
  text-align: center !important;
  color: var(--text-muted) !important;
  font-style: italic !important;
  padding: 40px 20px !important;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .typer-abbreviation-dialog .modal {
    width: 95vw !important;
    height: 90vh !important;
  }
  
  .typer-controls-container {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 15px !important;
  }
  
  .typer-entry-fields {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }
  
  .typer-entry-row {
    flex-direction: column !important;
    gap: 10px !important;
  }
  
  .typer-entry-actions {
    flex-direction: row !important;
    justify-content: flex-end !important;
  }
}


`;

fs.writeFileSync(path.resolve(__dirname, "../styles.css"), cssOut);
console.log("styles.css generated");
