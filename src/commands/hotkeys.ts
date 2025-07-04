import { Command } from "obsidian";
import TyperPlugin from "../../main";

/** Creates hotkey commands for navigating suggestions using synthetic keyboard events. */
export function hotkeyCmd(plugin: TyperPlugin): Command[] {
  return [
    {
      id: "navigate-suggestions-up",
      name: "Navigate suggestions up",
      callback: () => {
        if (plugin.suggestor.context) {
          const syntheticEvent = new KeyboardEvent("keydown", {
            key: "ArrowUp",
            code: "ArrowUp",
            bubbles: true,
            cancelable: true,
          });
          (plugin.suggestor as any).handleKeybinds(syntheticEvent);
        }
      },
    },

    {
      id: "navigate-suggestions-down", 
      name: "Navigate suggestions down",
      callback: () => {
        if (plugin.suggestor.context) {
          const syntheticEvent = new KeyboardEvent("keydown", {
            key: "ArrowDown", 
            code: "ArrowDown",
            bubbles: true,
            cancelable: true,
          });
          (plugin.suggestor as any).handleKeybinds(syntheticEvent);
        }
      },
    },
  ];
}
