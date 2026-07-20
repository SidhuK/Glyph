import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "../../../i18n";

const FEEDBACK_MS = 1500;

function iconMarkup(copied: boolean): string {
	return renderToStaticMarkup(
		createElement(HugeiconsIcon, {
			icon: copied ? Tick02Icon : Copy01Icon,
			size: "var(--icon-sm)",
			strokeWidth: 0.9,
		}),
	);
}

function copyButton(): HTMLButtonElement {
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
		const text = btn.closest("pre")?.querySelector("code")?.textContent ?? "";
		const clipboard = navigator.clipboard;
		const finish = (ok: boolean) => {
			if (timer !== null) window.clearTimeout(timer);
			paint(ok ? "copied" : "failed");
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

/** Preview/read-only: copy control on each code block (widget on the block). */
export const CodeBlockCopyControls = Extension.create({
	name: "codeBlockCopyControls",
	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			new Plugin({
				key: new PluginKey("code-block-copy-controls"),
				props: {
					decorations(state) {
						if (editor.isEditable) return DecorationSet.empty;
						const decos: Decoration[] = [];
						state.doc.descendants((node, pos) => {
							if (node.type.name !== "codeBlock") return;
							decos.push(
								Decoration.widget(pos + 1, copyButton, {
									side: -1,
									ignoreSelection: true,
									key: `code-block-copy-${pos}`,
								}),
							);
						});
						return decos.length
							? DecorationSet.create(state.doc, decos)
							: DecorationSet.empty;
					},
				},
			}),
		];
	},
});
