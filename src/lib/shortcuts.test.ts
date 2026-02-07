import { describe, expect, it } from "vitest";
import { formatShortcut, isShortcutMatch } from "./shortcuts";

function keyEvent(
	key: string,
	mods?: { meta?: boolean; shift?: boolean; alt?: boolean; ctrl?: boolean },
): KeyboardEvent {
	return {
		key,
		metaKey: Boolean(mods?.meta),
		shiftKey: Boolean(mods?.shift),
		altKey: Boolean(mods?.alt),
		ctrlKey: Boolean(mods?.ctrl),
	} as KeyboardEvent;
}

describe("shortcuts", () => {
	it("matches exact modifier combinations", () => {
		expect(
			isShortcutMatch(keyEvent("k", { meta: true }), { key: "k", meta: true }),
		).toBe(true);
		expect(
			isShortcutMatch(keyEvent("k", { meta: true }), { key: "k", ctrl: true }),
		).toBe(false);
	});

	it("matches keys case-insensitively", () => {
		expect(isShortcutMatch(keyEvent("K"), { key: "k" })).toBe(true);
	});

	it("formats shortcut labels in stable modifier order", () => {
		expect(
			formatShortcut({
				key: "k",
				meta: true,
				shift: true,
				alt: true,
				ctrl: true,
			}),
		).toBe("⌘⇧⌥⌃K");
		expect(formatShortcut({ key: "Enter" })).toBe("Enter");
	});
});
