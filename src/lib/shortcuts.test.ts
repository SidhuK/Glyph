import { describe, expect, it } from "vitest";
import {
	getShortcutSignature,
	isShortcutMatch,
	normalizeShortcut,
	normalizeShortcutKey,
	shortcutFromKeyboardEvent,
	toTauriAccelerator,
	validateConfigurableShortcut,
} from "./shortcuts";

function keyEvent(
	key: string,
	mods?: {
		meta?: boolean;
		shift?: boolean;
		alt?: boolean;
		ctrl?: boolean;
		code?: string;
	},
): KeyboardEvent {
	return {
		key,
		code: mods?.code ?? "",
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

	it("normalizes shortcut keys before building signatures", () => {
		expect(normalizeShortcutKey(" ")).toBe("Space");
		const normalized = normalizeShortcut({
			key: "arrowleft",
			meta: true,
			shift: true,
		});
		expect(normalized).toEqual({
			key: "ArrowLeft",
			meta: true,
			ctrl: false,
			alt: false,
			shift: true,
		});
		expect(getShortcutSignature(normalized)).toBe("meta+shift+ArrowLeft");
	});

	it("rejects configurable shortcuts without a safe modifier", () => {
		expect(validateConfigurableShortcut({ key: "k" })).toEqual({
			valid: false,
			reason: "Shortcuts need Cmd, Ctrl, or Alt so normal typing stays safe.",
		});
		expect(validateConfigurableShortcut({ key: "Meta", meta: true })).toEqual({
			valid: false,
			reason: "Choose a non-modifier key.",
		});
	});

	it("captures modifier-only keydown state without making it the shortcut key", () => {
		expect(shortcutFromKeyboardEvent(keyEvent("Meta"))).toEqual({
			key: "",
			meta: true,
			ctrl: false,
			alt: false,
			shift: false,
		});
		expect(shortcutFromKeyboardEvent(keyEvent("Alt"))).toEqual({
			key: "",
			meta: false,
			ctrl: false,
			alt: true,
			shift: false,
		});
		expect(shortcutFromKeyboardEvent(keyEvent("k", { meta: true }))).toEqual({
			key: "k",
			meta: true,
			ctrl: false,
			alt: false,
			shift: false,
		});
		expect(
			shortcutFromKeyboardEvent(
				keyEvent("Ô", { meta: true, alt: true, shift: true, code: "KeyJ" }),
			),
		).toEqual({
			key: "j",
			meta: true,
			ctrl: false,
			alt: true,
			shift: true,
		});
		expect(
			shortcutFromKeyboardEvent(keyEvent(" ", { meta: true, code: "Space" })),
		).toEqual({
			key: "Space",
			meta: true,
			ctrl: false,
			alt: false,
			shift: false,
		});
	});

	it("converts supported bindings to tauri accelerators", () => {
		expect(
			toTauriAccelerator({ meta: true, alt: true, shift: true, key: "a" }),
		).toBe("CmdOrCtrl+Alt+Shift+A");
		expect(toTauriAccelerator({ meta: true, key: "ArrowLeft" })).toBe(
			"CmdOrCtrl+Left",
		);
		expect(
			toTauriAccelerator({
				meta: true,
				ctrl: true,
				alt: true,
				shift: true,
				key: "a",
			}),
		).toBe("CmdOrCtrl+Ctrl+Alt+Shift+A");
		expect(toTauriAccelerator({ meta: true, key: "F13" })).toBeNull();
	});
});
