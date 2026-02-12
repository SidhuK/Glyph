import { isMacOS } from "./shortcuts/platform";

/**
 * Represents a keyboard shortcut combination
 */
export interface Shortcut {
  /** The primary key (e.g., "s", "Enter", "Escape") */
  key: string;
  /** Command/Meta key (⌘ on macOS, Win on Windows) */
  meta?: boolean;
  /** Shift key */
  shift?: boolean;
  /** Alt/Option key */
  alt?: boolean;
  /** Control key */
  ctrl?: boolean;
}

/**
 * Check if a keyboard event matches a shortcut definition
 */
export function isShortcutMatch(
  event: KeyboardEvent,
  shortcut: Shortcut,
): boolean {
  if (event.metaKey !== Boolean(shortcut.meta)) return false;
  if (event.shiftKey !== Boolean(shortcut.shift)) return false;
  if (event.altKey !== Boolean(shortcut.alt)) return false;
  if (event.ctrlKey !== Boolean(shortcut.ctrl)) return false;
  return normalizeKey(event.key) === normalizeKey(shortcut.key);
}

/**
 * Format a shortcut for display (macOS style with symbols)
 * @deprecated Use formatShortcutForPlatform from shortcuts/platform for cross-platform support
 */
export function formatShortcut(shortcut: Shortcut): string {
  return formatShortcutParts(shortcut).join("");
}

/**
 * Format a shortcut as an array of parts for rendering with <kbd> elements
 * @deprecated Use formatShortcutPartsForPlatform from shortcuts/platform for cross-platform support
 */
export function formatShortcutParts(shortcut: Shortcut): string[] {
  const parts: string[] = [];
  if (shortcut.meta) parts.push("⌘");
  if (shortcut.shift) parts.push("⇧");
  if (shortcut.alt) parts.push("⌥");
  if (shortcut.ctrl) parts.push("⌃");
  parts.push(
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key,
  );
  return parts;
}

/**
 * Normalize a key string for comparison
 */
function normalizeKey(key: string): string {
  return key.toLowerCase();
}

/**
 * Get a tooltip-friendly string for a shortcut
 * Returns platform-appropriate format (⌘S on macOS, Ctrl+S on Windows/Linux)
 */
export function getShortcutTooltip(shortcut: Shortcut): string {
  const isMac = isMacOS();
  const parts: string[] = [];

  if (shortcut.meta) parts.push(isMac ? "⌘" : "Ctrl");
  if (shortcut.ctrl && !shortcut.meta) parts.push(isMac ? "⌃" : "Ctrl");
  if (shortcut.alt) parts.push(isMac ? "⌥" : "Alt");
  if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");

  const key =
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(key);

  return parts.join(isMac ? "" : "+");
}
