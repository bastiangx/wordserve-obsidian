import { CONFIG } from "../core/config";

export type KeybindAction =
  | "up"
  | "down"
  | "select"
  | "close"
  | "numberSelect";

export interface Keybinds {
  [action: string]: string[];
}

export class KeybindManager {
  private keybinds: Keybinds;
  private insertSpaceAfter: boolean;

  constructor() {
    const { insertSpaceAfter, ...keybinds } = CONFIG.keybinds;
    this.keybinds = keybinds;
    this.insertSpaceAfter = CONFIG.keybinds.insertSpaceAfter;
  }

  get binds(): Keybinds {
    return this.keybinds;
  }

  get insertSpace(): boolean {
    return this.insertSpaceAfter;
  }

  set insertSpace(value: boolean) {
    this.insertSpaceAfter = value;
  }

  getKeysForAction(action: KeybindAction): string[] {
    return this.keybinds[action] || [];
  }

  overrideKeybind(action: KeybindAction, keys: string[]) {
    this.keybinds[action] = keys;
  }
}

export const keybindManager = new KeybindManager();
