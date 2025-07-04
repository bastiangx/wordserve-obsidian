import { CONFIG } from "../core/config";
import { KeybindsConfig } from "../core/config";

export type KeybindAction =
  | "up"
  | "down"
  | "select"
  | "select_and_space"
  | "close"
  | "numberSelect";

export type Keybinds = KeybindsConfig;

/** Manages keybind configuration and provides access to key mappings. */
export class KeybindManager {
  private keybinds: Keybinds;

  constructor() {
    this.keybinds = CONFIG.keybinds;
  }

  get binds(): Keybinds {
    return this.keybinds;
  }

  getKeysForAction(action: KeybindAction): string[] {
    return this.keybinds[action] || [];
  }

  overrideKeybind(action: KeybindAction, keys: string[]) {
    this.keybinds[action] = keys;
  }
}

export const keybindManager = new KeybindManager();
