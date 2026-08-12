import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "../../../i18n";

const FEEDBACK_MS = 1500;

const pluginKey = new PluginKey<CodeBlockCopyPluginState>(
	"code-block-copy-controls",
);

interface CodeBlockCopyPluginState {
	decorations: DecorationSet;
	editable: boolean;
}

function iconMarkup(copied: boolean): string {
	return renderToStaticMarkup(
		createElement(HugeiconsIcon, {
			icon: copied ? Tick02Icon : Copy01Icon,
			size: "var(--icon-sm)",
		}),
	);
}

function codeBlockTextAtWidget(
	view: EditorView,
	getPos: () => number | undefined,
): string {
	const pos = getPos();
	if (typeof pos !== "number") return "";
	const $pos = view.state.doc.resolve(pos);
	if ($pos.parent.type.name !== "codeBlock") return "";
	return $pos.parent.textContent ?? "";
}

function copyButton(
	view: EditorView,
	getPos: () => number | undefined,
): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "codeBlockActionBtn codeBlockInlineCopy";
	let timer: number | null = null;

	const paint = (kind: "idle" | "copied" | "failed") => {
		const label = i18n.t(
			kind === "copied"
				? "editor:codeBlock.copied"
				: kind === "failed"
					? "editor:codeBlock.copyFailed"
					: "editor:codeBlock.copy",
		);
		btn.title = label;
		btn.setAttribute("aria-label", label);
		btn.innerHTML = iconMarkup(kind === "copied");
		btn.toggleAttribute("data-copied", kind === "copied");
		btn.toggleAttribute("data-failed", kind === "failed");
	};
	paint("idle");

	btn.addEventListener("mousedown", (e) => {
		e.preventDefault();
		e.stopPropagation();
	});
	btn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const text = codeBlockTextAtWidget(view, getPos);
		const clipboard = navigator.clipboard;
		const finish = (ok: boolean) => {
			if (timer !== null) window.clearTimeout(timer);
			paint(ok ? "copied" : "failed");
			// Keep success/fail visible briefly, then return the control to idle.
			timer = window.setTimeout(() => {
				timer = null;
				paint("idle");
			}, FEEDBACK_MS);
		};
		if (!clipboard?.writeText) {
			console.error("Clipboard API is unavailable.");
			finish(false);
			return;
		}
		void clipboard.writeText(text).then(
			() => finish(true),
			(err: unknown) => {
				console.error("Failed to copy code block contents.", err);
				finish(false);
			},
		);
	});
	return btn;
}

function buildCopyDecorations(doc: ProseMirrorNode): DecorationSet {
	const decos: Decoration[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name !== "codeBlock") return;
		decos.push(
			Decoration.widget(
				pos + 1,
				(view, getPos) => {
					const resolvePos =
						typeof getPos === "function" ? getPos : () => undefined;
					return copyButton(view, resolvePos);
				},
				{
					side: -1,
					ignoreSelection: true,
					key: `code-block-copy-${pos}`,
				},
			),
		);
		return false;
	});
	return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

/** Preview/read-only: copy control on each code block (widget on the block). */
export const CodeBlockCopyControls = Extension.create({
	name: "codeBlockCopyControls",
	addProseMirrorPlugins() {
		const editor = this.editor;
		const getEditable = () => editor.isEditable;

		return [
			new Plugin<CodeBlockCopyPluginState>({
				key: pluginKey,
				state: {
					init: (_config, state) => {
						const editable = getEditable();
						return {
							editable,
							decorations: editable
								? DecorationSet.empty
								: buildCopyDecorations(state.doc),
						};
					},
					apply(transaction, value, _oldState, newState) {
						const editable = getEditable();
						if (editable) {
							if (value.editable) return value;
							return {
								editable: true,
								decorations: DecorationSet.empty,
							};
						}
						if (!value.editable && !transaction.docChanged) {
							return value;
						}
						return {
							editable: false,
							decorations: buildCopyDecorations(newState.doc),
						};
					},
				},
				props: {
					decorations(state) {
						// setEditable does not run plugin apply, so after rich→preview
						// the cache can still be the empty set from editable mode.
						if (editor.isEditable) return DecorationSet.empty;
						const cached = pluginKey.getState(state);
						if (cached && !cached.editable) return cached.decorations;
						return buildCopyDecorations(state.doc);
					},
				},
			}),
		];
	},
});
