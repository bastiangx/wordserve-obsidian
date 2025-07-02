import { Command } from "obsidian";
import TyperPlugin from "../../main";

export function hotkeyCmd(plugin: TyperPlugin): Command[] {
  return [
    {
      id: "navigate-suggestions-up",
      name: "Navigate suggestions up",
      callback: () => {
        if (plugin.suggestor.context) {
          // Find the suggestion container and dispatch event there to avoid recursion
          const suggestionContainer = document.querySelector('.suggestion-container');
          if (suggestionContainer) {
            const syntheticEvent = new KeyboardEvent("keydown", {
              key: "ArrowUp",
              code: "ArrowUp",
              bubbles: false,  // Prevent bubbling to avoid infinite recursion
              cancelable: true,
            });
            suggestionContainer.dispatchEvent(syntheticEvent);
          }
        }
      },
    },

    {
      id: "navigate-suggestions-down",
      name: "Navigate suggestions down",
      callback: () => {
        if (plugin.suggestor.context) {
          // Find the suggestion container and dispatch event there to avoid recursion
          const suggestionContainer = document.querySelector('.suggestion-container');
          if (suggestionContainer) {
            const syntheticEvent = new KeyboardEvent("keydown", {
              key: "ArrowDown",
              code: "ArrowDown",
              bubbles: false,  // Prevent bubbling to avoid infinite recursion
              cancelable: true,
            });
            suggestionContainer.dispatchEvent(syntheticEvent);
          }
        }
      },
    },

    {
      id: "select-suggestion",
      name: "Select current suggestion",
      callback: () => {
        if (plugin.suggestor.context) {
          // Find currently selected suggestion and select it
          const selectedElement = document.querySelector(
            ".suggestion-item.is-selected"
          );
          if (
            selectedElement &&
            plugin.suggestor.getLastSuggestions().length > 0
          ) {
            const suggestionElements =
              document.querySelectorAll(".suggestion-item");
            const selectedIndex =
              Array.from(suggestionElements).indexOf(selectedElement);
            const suggestions = plugin.suggestor.getLastSuggestions();

            if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
              const syntheticEvent = new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                bubbles: true,
                cancelable: true,
              });
              plugin.suggestor.selectSuggestion(
                suggestions[selectedIndex],
                syntheticEvent
              );
            }
          }
        }
      },
    },

    {
      id: "close-suggestions",
      name: "Close suggestion menu",
      callback: () => {
        if (plugin.suggestor.context) {
          plugin.suggestor.close();
        }
      },
    },
  ];
}
