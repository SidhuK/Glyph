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
