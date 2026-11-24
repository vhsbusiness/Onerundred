export const MAX_CHECKLIST_ITEMS = 50;
export const MAX_CHECKLIST_TEXT = 200;
export type NewChecklistItem = { id: string; text: string };

/** Typing keeps the unfinished final item; a paste/Enter submits the entire list. */
export function splitChecklistInput(value: string, submitLast = false) {
  const parts = value.split(",");
  const remainder = submitLast ? "" : parts.pop() ?? "";
  return { texts: parts.map(text => text.trim()).filter(Boolean), remainder };
}
