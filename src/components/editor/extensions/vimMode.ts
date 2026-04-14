import { type Editor, Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, Selection } from "@tiptap/pm/state";

type VimInputMode = "insert" | "normal";

interface VimModeStorage {
	mode: VimInputMode;
	pendingKey: string | null;
	pendingExpiresAt: number;
}

interface TextBlockContext {
	depth: number;
	end: number;
	node: EditorState["doc"];
	offset: number;
	start: number;
}

const PENDING_KEY_TIMEOUT_MS = 800;
const SWALLOWED_NORMAL_KEYS = ["Backspace", "Delete", "Enter", "Space", "Tab"];
const PRINTABLE_NORMAL_KEYS = Array.from(
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`-=[]\\;',./~!@#%^&*()_+{}|:\"<>?",
);

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		vimMode: {
			enterVimInsertMode: () => ReturnType;
			enterVimNormalMode: () => ReturnType;
		};
	}
}

function hasOpenSuggestionMenu() {
	return Boolean(
		document.querySelector(".slashCommandMenu, .wikiLinkSuggestionMenu"),
	);
}

function getTextBlockContext(state: EditorState): TextBlockContext | null {
	const { $head } = state.selection;

	for (let depth = $head.depth; depth > 0; depth -= 1) {
		const node = $head.node(depth);
		if (!node.isTextblock) continue;
		const start = $head.start(depth);
		const end = $head.end(depth);
		return {
			depth,
			end,
			node,
			offset: Math.max(0, Math.min($head.pos - start, node.textContent.length)),
			start,
		};
	}

	return null;
}

function clampPosition(state: EditorState, pos: number) {
	return Math.max(0, Math.min(state.doc.content.size, pos));
}

function setSelection(editor: Editor, pos: number) {
	const { state, view } = editor;
	const nextPos = clampPosition(state, pos);
	const selection = Selection.near(state.doc.resolve(nextPos));
	view.dispatch(state.tr.setSelection(selection).scrollIntoView());
}

function moveBy(editor: Editor, delta: number) {
	setSelection(editor, editor.state.selection.head + delta);
	return true;
}

function moveVertically(editor: Editor, direction: -1 | 1) {
	const { state, view } = editor;
	const head = state.selection.head;
	const coords = view.coordsAtPos(head);
	const lineHeight = Number.parseFloat(getComputedStyle(view.dom).lineHeight);
	const distance = Number.isFinite(lineHeight) ? lineHeight : 20;
	const target = view.posAtCoords({
		left: coords.left,
		top:
			direction > 0 ? coords.bottom + distance / 2 : coords.top - distance / 2,
	});

	if (target) {
		setSelection(editor, target.pos);
	}

	return true;
}

function moveToTextBlockStart(editor: Editor) {
	const context = getTextBlockContext(editor.state);
	if (!context) return true;
	setSelection(editor, context.start);
	return true;
}

function moveToTextBlockEnd(editor: Editor) {
	const context = getTextBlockContext(editor.state);
	if (!context) return true;
	setSelection(editor, context.end);
	return true;
}

function moveToNextWordStart(editor: Editor) {
	const context = getTextBlockContext(editor.state);
	if (!context) return true;
	const text = context.node.textContent;
	let offset = context.offset;

	while (offset < text.length && !/\s/.test(text[offset] ?? "")) offset += 1;
	while (offset < text.length && /\s/.test(text[offset] ?? "")) offset += 1;

	setSelection(editor, context.start + offset);
	return true;
}

function moveToPreviousWordStart(editor: Editor) {
	const context = getTextBlockContext(editor.state);
	if (!context) return true;
	const text = context.node.textContent;
	let offset = Math.max(0, context.offset - 1);

	while (offset > 0 && /\s/.test(text[offset] ?? "")) offset -= 1;
	while (offset > 0 && !/\s/.test(text[offset - 1] ?? "")) offset -= 1;

	setSelection(editor, context.start + offset);
	return true;
}

function moveToWordEnd(editor: Editor) {
	const context = getTextBlockContext(editor.state);
	if (!context) return true;
	const text = context.node.textContent;
	let offset = Math.min(text.length, context.offset + 1);

	while (offset < text.length && /\s/.test(text[offset] ?? "")) offset += 1;
	while (offset < text.length - 1 && !/\s/.test(text[offset + 1] ?? "")) {
		offset += 1;
	}

	setSelection(editor, context.start + offset);
	return true;
}

function openLine(editor: Editor, placement: "above" | "below") {
	const context = getTextBlockContext(editor.state);
	if (!context) return true;
	const pos = placement === "above" ? context.start : context.end;
	editor.chain().focus().setTextSelection(pos).splitBlock().run();
	editor.commands.enterVimInsertMode();
	return true;
}

function deleteCharacter(editor: Editor) {
	const { state } = editor;
	const context = getTextBlockContext(state);
	if (!context) return true;
	if (!state.selection.empty) {
		editor.chain().focus().deleteSelection().run();
		return true;
	}
	const pos = state.selection.head;
	if (pos >= context.end) return true;
	editor
		.chain()
		.focus()
		.deleteRange({ from: pos, to: pos + 1 })
		.run();
	return true;
}

function deleteTextBlockContents(editor: Editor) {
	const context = getTextBlockContext(editor.state);
	if (!context) return true;
	editor
		.chain()
		.focus()
		.deleteRange({ from: context.start, to: context.end })
		.run();
	return true;
}

function runNormalModeCommand(
	storage: VimModeStorage,
	editor: Editor,
	command: () => boolean,
) {
	if (!editor.isEditable || storage.mode !== "normal") return false;
	storage.pendingKey = null;
	return command();
}

function swallowNormalModeKey(storage: VimModeStorage, editor: Editor) {
	if (!editor.isEditable || storage.mode !== "normal") return false;
	storage.pendingKey = null;
	return true;
}

export const VimMode = Extension.create<object, VimModeStorage>({
	name: "vimMode",
	priority: 1000,

	addStorage() {
		return {
			mode: "insert",
			pendingExpiresAt: 0,
			pendingKey: null,
		};
	},

	addCommands() {
		return {
			enterVimInsertMode: () => (): boolean => {
				this.storage.mode = "insert";
				this.storage.pendingKey = null;
				return true;
			},
			enterVimNormalMode:
				() =>
				({ state, tr, dispatch }): boolean => {
					this.storage.mode = "normal";
					this.storage.pendingKey = null;
					if (!dispatch) return true;

					const context = getTextBlockContext(state);
					const minPos = context?.start ?? 0;
					const maxPos = context?.end ?? state.doc.content.size;
					const head = state.selection.head;
					const nextPos = Math.max(minPos, Math.min(head - 1, maxPos));
					const selection = Selection.near(state.doc.resolve(nextPos));
					dispatch(tr.setSelection(selection).scrollIntoView());
					return true;
				},
		};
	},

	addKeyboardShortcuts() {
		const normal = (command: () => boolean) => () =>
			runNormalModeCommand(this.storage, this.editor, command);
		const swallow = () => swallowNormalModeKey(this.storage, this.editor);
		const shortcuts: Record<string, () => boolean> = {
			Escape: () => {
				if (!this.editor.isEditable || hasOpenSuggestionMenu()) return false;
				return this.editor.commands.enterVimNormalMode();
			},
			"Control-r": normal(() => this.editor.commands.redo()),
			$: normal(() => moveToTextBlockEnd(this.editor)),
			0: normal(() => moveToTextBlockStart(this.editor)),
			A: normal(() => {
				moveToTextBlockEnd(this.editor);
				return this.editor.commands.enterVimInsertMode();
			}),
			G: normal(() => {
				setSelection(this.editor, this.editor.state.doc.content.size);
				return true;
			}),
			I: normal(() => {
				moveToTextBlockStart(this.editor);
				return this.editor.commands.enterVimInsertMode();
			}),
			O: normal(() => openLine(this.editor, "above")),
			a: normal(() => {
				moveBy(this.editor, 1);
				return this.editor.commands.enterVimInsertMode();
			}),
			b: normal(() => moveToPreviousWordStart(this.editor)),
			d: () => {
				if (!this.editor.isEditable || this.storage.mode !== "normal")
					return false;
				const now = Date.now();
				if (
					this.storage.pendingKey === "d" &&
					this.storage.pendingExpiresAt > now
				) {
					this.storage.pendingKey = null;
					return deleteTextBlockContents(this.editor);
				}
				this.storage.pendingKey = "d";
				this.storage.pendingExpiresAt = now + PENDING_KEY_TIMEOUT_MS;
				return true;
			},
			e: normal(() => moveToWordEnd(this.editor)),
			g: () => {
				if (!this.editor.isEditable || this.storage.mode !== "normal")
					return false;
				const now = Date.now();
				if (
					this.storage.pendingKey === "g" &&
					this.storage.pendingExpiresAt > now
				) {
					this.storage.pendingKey = null;
					setSelection(this.editor, 0);
					return true;
				}
				this.storage.pendingKey = "g";
				this.storage.pendingExpiresAt = now + PENDING_KEY_TIMEOUT_MS;
				return true;
			},
			h: normal(() => moveBy(this.editor, -1)),
			i: normal(() => this.editor.commands.enterVimInsertMode()),
			j: normal(() => moveVertically(this.editor, 1)),
			k: normal(() => moveVertically(this.editor, -1)),
			l: normal(() => moveBy(this.editor, 1)),
			o: normal(() => openLine(this.editor, "below")),
			u: normal(() => this.editor.commands.undo()),
			w: normal(() => moveToNextWordStart(this.editor)),
			x: normal(() => deleteCharacter(this.editor)),
		};

		for (const key of SWALLOWED_NORMAL_KEYS) {
			shortcuts[key] = swallow;
		}
		for (const key of PRINTABLE_NORMAL_KEYS) {
			shortcuts[key] ??= swallow;
		}

		return shortcuts;
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					handleTextInput: () =>
						this.editor.isEditable && this.storage.mode === "normal",
				},
			}),
		];
	},
});
