/**
 * Represents a keyboard shortcut combination.
 */
export interface Shortcut {
	key: string;
	meta?: boolean;
	shift?: boolean;
	alt?: boolean;
	ctrl?: boolean;
}

export interface ShortcutValidationResult {
	valid: boolean;
	reason: string | null;
}
