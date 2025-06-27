import { CONFIG } from "../core/config";

export type KeybindAction =
  | "up"
  | "down"
  | "select"
  | "close"
  | "numberSelect"
  | "tabNext"
  | "tabPrev"
  | "macosUp"
  | "macosDown"
  | "vimUp"
  | "vimDown"
  | "vimAltUp"
  | "vimAltDown";

export type KeybindMode = "default" | "macos" | "tabs" | "vim";

export interface Keybinds {
  [action: string]: string[];
}

export class KeybindManager {
  private mode: KeybindMode;
  private keybinds: Keybinds;
  private insertSpaceAfter: boolean;

  constructor(mode: KeybindMode = CONFIG.keybind_modes.default as KeybindMode) {
    this.mode = mode;
    const { insertSpaceAfter, ...keybinds } = CONFIG.keybinds;
    this.keybinds = keybinds;
    this.insertSpaceAfter = CONFIG.keybinds.insertSpaceAfter;
  }

  setMode(mode: KeybindMode) {
    this.mode = mode;
  }

  getMode(): KeybindMode {
    return this.mode;
  }

  getKeybinds(): Keybinds {
    return this.keybinds;
  }

  getKeysForAction(action: KeybindAction): string[] {
    return this.keybinds[action] || [];
  }

  isInsertSpaceAfter(): boolean {
    return this.insertSpaceAfter;
  }

  overrideKeybind(action: KeybindAction, keys: string[]) {
    this.keybinds[action] = keys;
  }

  setInsertSpaceAfter(val: boolean) {
    this.insertSpaceAfter = val;
  }
}

export const keybindManager = new KeybindManager();
