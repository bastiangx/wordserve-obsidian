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

// Ensure ghostTextEnabled is present in config.plugin
if (!("ghostTextEnabled" in config.plugin)) {
  config.plugin.ghostTextEnabled = true;
}

// Ensure autoInsertion is present in config.plugin
if (!("autoInsertion" in config.plugin)) {
  config.plugin.autoInsertion = false;
}

// Ensure autoInsertionCommitMode is present in config.plugin
if (!("autoInsertionCommitMode" in config.plugin)) {
  config.plugin.autoInsertionCommitMode = "space-commits";
}

// Ensure smartBackspace is present in config.plugin
if (!("smartBackspace" in config.plugin)) {
  config.plugin.smartBackspace = true;
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
    ghostTextColorIntensity: "faint",
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

if (!("autorespawn" in config)) {
  config.autorespawn = {
    enabled: true,
    requestThreshold: 4000,
    timeThresholdMinutes: 60,
  };
}

if (!("enabled" in config.autorespawn)) {
  config.autorespawn.enabled = true;
}
if (!("requestThreshold" in config.autorespawn)) {
  config.autorespawn.requestThreshold = 4000;
}
if (!("timeThresholdMinutes" in config.autorespawn)) {
  config.autorespawn.timeThresholdMinutes = 60;
}

// Ensure minPrefix is present in config.plugin
if (!("minPrefix" in config.plugin)) {
  config.plugin.minPrefix = 2;
}

// Ensure maxLimit is present in config.plugin
if (!("maxLimit" in config.plugin)) {
  config.plugin.maxLimit = 50;
}

const configOut = `// THIS FILE IS AUTO‐GENERATED — DO NOT EDIT
import { WordServePluginSettings } from "../types";

export interface PluginConfig {
  minWordLength: number;
  maxSuggestions: number;
  debounceTime: number;
  numberSelection: boolean;
  showRankingOverride: boolean;
  compactMode: boolean;
  ghostTextEnabled: boolean;
  autoInsertion: boolean;
  autoInsertionCommitMode: "space-commits" | "enter-only";
  smartBackspace: boolean;
  fontSize: "smallest" | "smaller" | "small" | "editor" | "ui-small" | "ui-medium" | "ui-larger";
  fontWeight: "thin" | "extralight" | "light" | "normal" | "medium" | "semibold" | "bold" | "extrabold" | "black";
  debugMode: boolean;
  dictionarySize: number;
  abbreviationsEnabled: boolean;
  abbreviationNotification: boolean;
  minPrefix: number;
  maxLimit: number;
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
    selected_rank_bg_opacity: number;
}

export interface KeybindsConfig {
  up: string[];
  down: string[];
  select: string[];
  select_and_space: string[];
  close: string[];
  numberSelect: string[];
}

export interface KeybindModesConfig {
  available: string[];
  default: string;
}

export interface AccessibilityConfig {
  boldSuffix: boolean;
  uppercaseSuggestions: boolean;
  prefixColorIntensity: "normal" | "muted" | "faint" | "accent" ;
  ghostTextColorIntensity: "normal" | "muted" | "faint" | "accent" ;
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

export interface AutorespawnConfig {
  enabled: boolean;
  requestThreshold: number;
  timeThresholdMinutes: number;
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
  autorespawn: AutorespawnConfig;
}

// Auto-generated config values
export const CONFIG: ConfigType = ${JSON.stringify(config, null, 2)};

export const DEFAULT_SETTINGS: WordServePluginSettings = {
  minWordLength: CONFIG.plugin.minWordLength,
  maxSuggestions: CONFIG.plugin.maxSuggestions,
  debounceTime: CONFIG.plugin.debounceTime,
  numberSelection: CONFIG.plugin.numberSelection,
  showRankingOverride: CONFIG.plugin.showRankingOverride,
  compactMode: CONFIG.plugin.compactMode,
  ghostTextEnabled: CONFIG.plugin.ghostTextEnabled,
  autoInsertion: CONFIG.plugin.autoInsertion,
  autoInsertionCommitMode: CONFIG.plugin.autoInsertionCommitMode,
  smartBackspace: CONFIG.plugin.smartBackspace,
  fontSize: CONFIG.plugin.fontSize,
  fontWeight: CONFIG.plugin.fontWeight,
  accessibility: CONFIG.accessibility,
  debugMode: CONFIG.plugin.debugMode,
  debug: CONFIG.debug,
  dictionarySize: CONFIG.plugin.dictionarySize,
  abbreviationsEnabled: CONFIG.plugin.abbreviationsEnabled,
  abbreviationNotification: CONFIG.plugin.abbreviationNotification,
  minPrefix: CONFIG.plugin.minPrefix,
  maxLimit: CONFIG.plugin.maxLimit,
  autorespawn: CONFIG.autorespawn,
};
`;
fs.writeFileSync(path.resolve(__dirname, "../src/core/config.ts"), configOut);
console.log("config.ts generated");

const s = config.style;
const cssOut = `/* THIS FILE IS AUTOGENERATED via scripts/ */

/* Suggestions dropdown */
.wordserve-suggestion-container {
  display: flex;
  align-items: center;
  padding: ${s.padding};
  cursor: pointer;
  font-family: var(--font-text), var(--font-text-theme),
    var(--font-monospace),var(--font-monospace-theme), sans-serif, serif, monospace ;
}

.wordserve-suggestion-rank {
  display: inline-block;
  min-width: 1.8em;
  width: auto;
  height: 1.8em;
  flex-shrink: 0;
  border-radius: 12%;
  margin-right: 0.7em;
  padding-right: 0.1em;
  background-color: var(--interactive-normal);
  color: var(--text-normal); 

  font-size: 0.8em;
  text-align: center;
  line-height: 1.8em;
}

.wordserve-suggestion-content {
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Selected suggestion */
.suggestion-item.is-selected {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}

.suggestion-item.is-selected .wordserve-suggestion-rank {
  background-color: var(--interactive-accent-hover);
  color: var(--text-on-accent);
}

.suggestion-item.is-selected .suggestion-prefix {
  color: var(--text-on-accent);
  opacity: 0.8;
}

.suggestion-item.is-selected .suggestion-suffix {
  color: var(--text-on-accent);
}

/* Prefix highlighting */
.suggestion-prefix {
  color: var(--text-faint);
}

.suggestion-suffix {
  color: var(--text-normal);
}

/* Compact mode */
body.wordserve-compact-mode .wordserve-suggestion-container {
  padding: ${s.compact_padding};
}

body.wordserve-compact-mode .wordserve-suggestion-rank {
  min-width: 1.5em;
  width: auto;
  height: 1.5em;
  margin-right: 0.5em;
  padding-right: 0.1em;
  font-size: 0.8em;
  line-height: 1.5em;
}

/* Accessibility - Bold suffix */
body.wordserve-bold-suffix .suggestion-suffix {
  font-weight: bold;
}

/* Accessibility - Uppercase suggestions */
body.wordserve-uppercase .wordserve-suggestion-content {
  text-transform: uppercase;
}

/* Accessibility - Prefix color variants */
body.wordserve-prefix-normal .suggestion-prefix {
  color: var(--text-normal);
}

body.wordserve-prefix-muted .suggestion-prefix {
  color: var(--text-muted);
}

body.wordserve-prefix-faint .suggestion-prefix {
  color: var(--text-faint);
}

body.wordserve-prefix-accent .suggestion-prefix {
  color: var(--text-accent);
}


/* Font Size Options */
body.wordserve-font-smallest .wordserve-suggestion-container {
  font-size: var(--font-smallest);
}

body.wordserve-font-smaller .wordserve-suggestion-container {
  font-size: var(--font-smaller);
}

body.wordserve-font-small .wordserve-suggestion-container {
  font-size: var(--font-small);
}

body.wordserve-font-editor .wordserve-suggestion-container {
  font-size: var(--font-text-size);
}

body.wordserve-font-ui-small .wordserve-suggestion-container {
  font-size: var(--font-ui-small);
}

body.wordserve-font-ui-medium .wordserve-suggestion-container {
  font-size: var(--font-ui-medium);
}

body.wordserve-font-ui-larger .wordserve-suggestion-container {
  font-size: var(--font-ui-larger);
}

/* Font Weight Options */
body.wordserve-weight-thin .wordserve-suggestion-container {
  font-weight: var(--font-thin);
}

body.wordserve-weight-extralight .wordserve-suggestion-container {
  font-weight: var(--font-extralight);
}

body.wordserve-weight-light .wordserve-suggestion-container {
  font-weight: var(--font-light);
}

body.wordserve-weight-normal .wordserve-suggestion-container {
  font-weight: var(--font-normal);
}

body.wordserve-weight-medium .wordserve-suggestion-container {
  font-weight: var(--font-medium);
}

body.wordserve-weight-semibold .wordserve-suggestion-container {
  font-weight: var(--font-semibold);
}

body.wordserve-weight-bold .wordserve-suggestion-container {
  font-weight: var(--font-bold);
}

body.wordserve-weight-extrabold .wordserve-suggestion-container {
  font-weight: var(--font-extrabold);
}

body.wordserve-weight-black .wordserve-suggestion-container {
  font-weight: var(--font-black);
}

/* Live Preview Styles */
.wordserve-preview-container {
  margin: 20px 0;
  padding: 16px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  background: var(--background-secondary);
}

.wordserve-preview-header {
  margin-bottom: 12px;
}

.wordserve-preview-title {
  font-weight: 600;
  color: var(--text-normal);
  font-size: 14px;
  display: block;
  margin-bottom: 4px;
}

.wordserve-preview-description {
  color: var(--text-muted);
  font-size: 12px;
  display: block;
}

.wordserve-preview-input-container {
  position: relative;
  margin-bottom: 8px;
}

.wordserve-preview-input {
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

.wordserve-preview-input:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.wordserve-preview-suggestions {
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  box-shadow: var(--shadow-s);
  max-height: calc(4 * 40px); /* Space for 4 suggestion items */
  overflow: hidden;
  display: block; /* Always visible */
}

.wordserve-preview-suggestion-item {
  border-bottom: 1px solid var(--background-modifier-border-hover);
}

.wordserve-preview-suggestion-item:last-child {
  border-bottom: none;
}

.wordserve-preview-suggestion-item:hover {
  background: var(--background-modifier-hover);
}

/* Compact mode adjustments for preview */
body.wordserve-compact-mode .wordserve-preview-suggestions {
  max-height: calc(4 * 32px); /* Smaller space for compact mode */
}

/* Empty rows styling */
.wordserve-preview-empty-row {
  opacity: 0.3;
}

.wordserve-preview-empty-row .wordserve-suggestion-container {
  color: var(--text-faint);
}

/* Abbreviation Dialog Styles */
.wordserve-abbreviation-dialog .modal {
  width: 700px !important;
  max-width: 90vw !important;
  height: 600px !important;
  max-height: 80vh !important;
}

.wordserve-abbreviation-dialog .modal-content {
  padding: 20px !important;
  display: flex !important;
  flex-direction: column !important;
  height: 100% !important;
}

.wordserve-abbreviation-dialog h2 {
  margin: 0 0 20px 0 !important;
  font-size: 1.5em !important;
  font-weight: 600 !important;
  color: var(--text-normal) !important;
}

/* Controls Section */
.wordserve-controls-container {
  display: flex !important;
  gap: 20px !important;
  align-items: flex-end !important;
  margin-bottom: 20px !important;
  padding-bottom: 15px !important;
  border-bottom: 1px solid var(--background-modifier-border) !important;
}

.wordserve-search-container,
.wordserve-sort-container {
  display: flex !important;
  flex-direction: column !important;
  gap: 5px !important;
}

.wordserve-search-container {
  flex: 1 !important;
}

.wordserve-search-container label,
.wordserve-sort-container label {
  font-size: 0.9em !important;
  font-weight: 500 !important;
  color: var(--text-muted) !important;
}

.wordserve-search-container input {
  padding: 8px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
}

.wordserve-sort-container select {
  padding: 8px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  min-width: 150px !important;
}

/* Add Button */
.wordserve-add-button-container {
  margin-bottom: 20px !important;
}

.wordserve-add-button-container button {
  background: var(--interactive-accent) !important;
  color: var(--text-on-accent) !important;
  border: none !important;
  padding: 10px 20px !important;
  border-radius: 6px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  transition: background-color 0.2s !important;
}

.wordserve-add-button-container button:hover {
  background: var(--interactive-accent-hover) !important;
}

/* Entries Container */
.wordserve-entries-container {
  flex: 1 !important;
  overflow-y: auto !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 6px !important;
  padding: 10px !important;
  background: var(--background-secondary) !important;
}

/* Entry Rows */
.wordserve-entry-row {
  display: flex !important;
  gap: 15px !important;
  padding: 15px !important;
  margin-bottom: 15px !important;
  background: var(--background-primary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 6px !important;
  align-items: flex-start !important;
}

.wordserve-entry-row:last-child {
  margin-bottom: 0 !important;
}

.wordserve-entry-new {
  border-color: var(--interactive-accent) !important;
  background: var(--background-primary-alt) !important;
}

/* Entry Fields */
.wordserve-entry-fields {
  flex: 1 !important;
  display: grid !important;
  grid-template-columns: 200px 1fr !important;
  gap: 15px !important;
  align-items: flex-start !important;
}

.wordserve-shortcut-container,
.wordserve-target-container {
  display: flex !important;
  flex-direction: column !important;
}

.wordserve-shortcut-container input {
  padding: 8px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  font-family: var(--font-monospace) !important;
}

.wordserve-target-container textarea {
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
.wordserve-entry-actions {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  min-width: 80px !important;
}

.wordserve-entry-actions button {
  padding: 6px 12px !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 4px !important;
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  cursor: pointer !important;
  font-size: 0.9em !important;
  transition: all 0.2s !important;
}

.wordserve-entry-actions button:hover {
  background: var(--background-modifier-hover) !important;
}

.wordserve-entry-actions button.mod-warning {
  color: var(--text-error) !important;
  border-color: var(--text-error) !important;
}

.wordserve-entry-actions button.mod-warning:hover {
  background: var(--background-modifier-error) !important;
  color: var(--text-normal) !important;
}

.wordserve-entry-actions button.mod-cta {
  background: var(--interactive-accent) !important;
  color: var(--text-on-accent) !important;
  border-color: var(--interactive-accent) !important;
}

.wordserve-entry-actions button.mod-cta:hover {
  background: var(--interactive-accent-hover) !important;
}

/* No entries message */
.wordserve-no-entries {
  text-align: center !important;
  color: var(--text-muted) !important;
  font-style: italic !important;
  padding: 40px 20px !important;
}

/* Ghost Text Styling */
.wordserve-ghost-text {
  position: absolute;
  pointer-events: none;
  user-select: none;
  z-index: 1000;
  font-family: var(--font-text), var(--font-text-theme), var(--font-monospace), var(--font-monospace-theme), sans-serif;
  font-size: inherit;
  line-height: inherit;
  color: var(--text-faint);
  opacity: 0.7;
  display: inline-block !important;
  visibility: visible !important;
  white-space: pre;
  height: auto !important;
  background: transparent !important;
  padding: 0 !important;
  margin: 0 !important;
}

/* Bold ghost text when bold suffix is enabled */
body.wordserve-bold-suffix .wordserve-ghost-text {
  font-weight: bold;
}

/* Default ghost text styling (fallback) */
.cm-ghost-text {
  color: var(--text-faint) !important;
  opacity: 0.5 !important;
}

/* Ghost text color based on ghost text color settings */
body.wordserve-ghost-normal .cm-ghost-text {
  color: var(--text-normal) !important;
  opacity: 0.6 !important;
}

body.wordserve-ghost-muted .cm-ghost-text {
  color: var(--text-muted) !important;
  opacity: 0.7 !important;
}

body.wordserve-ghost-faint .cm-ghost-text {
  color: var(--text-faint) !important;
  opacity: 0.8 !important;
}

body.wordserve-ghost-accent .cm-ghost-text {
  color: var(--text-accent) !important;
  opacity: 0.6 !important;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .wordserve-abbreviation-dialog .modal {
    width: 95vw !important;
    height: 90vh !important;
  }
  
  .wordserve-controls-container {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 15px !important;
  }
  
  .wordserve-entry-fields {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }
  
  .wordserve-entry-row {
    flex-direction: column !important;
    gap: 10px !important;
  }
  
  .wordserve-entry-actions {
    flex-direction: row !important;
    justify-content: flex-end !important;
  }
}

/* Debug panel styles */
.typer-debug-events {
  margin-top: 20px;
}

.typer-debug-summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 10px;
}

.typer-debug-content {
  margin-left: 15px;
}

/* Abbreviation dialog styles */
.wordserve-abbreviation-dialog {
  width: 700px;
  max-width: 90vw;
  height: 600px;
  max-height: 80vh;
}

/* Suggestion rank hidden */
.wordserve-suggestion-rank.hidden {
  display: none;
}

`;

fs.writeFileSync(path.resolve(__dirname, "../styles.css"), cssOut);
console.log("styles.css generated");
