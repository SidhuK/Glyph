import type { Editor } from "@tiptap/core";
import { useCallback, useRef } from "react";
import { X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";
import { Input } from "../ui/shadcn/input";

export interface NoteLinkDialogState {
	href: string;
	range: { from: number; to: number };
	target: "_self" | "_blank";
}

interface NoteLinkDialogProps {
	editor: Editor | null;
	canEdit: boolean;
	state: NoteLinkDialogState | null;
	onStateChange: (state: NoteLinkDialogState | null) => void;
}

function normalizeEditorHref(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (
		trimmed.startsWith("http://") ||
		trimmed.startsWith("https://") ||
		trimmed.startsWith("mailto:") ||
		trimmed.startsWith("tel:") ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("/")
	) {
		return trimmed;
	}
	return `https://${trimmed}`;
}

/**
 * Dialog for setting, editing, or removing a link on the current editor selection.
 * Owns no mutable state — receives state + setter from the parent.
 */
export function NoteLinkDialog({
	editor,
	canEdit,
	state,
	onStateChange,
}: NoteLinkDialogProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const close = useCallback(() => onStateChange(null), [onStateChange]);

	const apply = useCallback(() => {
		if (!editor || !canEdit || !state) return;
		const href = normalizeEditorHref(state.href);
		const chain = editor
			.chain()
			.focus(null, { scrollIntoView: false })
			.setTextSelection(state.range)
			.extendMarkRange("link");
		if (!href) {
			chain.unsetLink().run();
			onStateChange(null);
			return;
		}
		chain
			.setLink({
				href,
				target: state.target,
				rel: state.target === "_blank" ? "noopener noreferrer" : undefined,
			})
			.run();
		onStateChange(null);
	}, [canEdit, editor, onStateChange, state]);

	const remove = useCallback(() => {
		if (!editor || !canEdit || !state) return;
		editor
			.chain()
			.focus(null, { scrollIntoView: false })
			.setTextSelection(state.range)
			.extendMarkRange("link")
			.unsetLink()
			.run();
		onStateChange(null);
	}, [canEdit, editor, onStateChange, state]);

	return (
		<Dialog
			open={state !== null}
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			<DialogContent
				className="editorLinkDialog"
				onOpenAutoFocus={(event) => {
					const input = inputRef.current;
					if (!input) return;
					event.preventDefault();
					input.focus();
					input.select();
				}}
			>
				<DialogHeader>
					<DialogTitle>Link</DialogTitle>
					<DialogDescription>
						Paste a URL, or leave it blank to remove the link.
					</DialogDescription>
				</DialogHeader>
				<form
					className="editorLinkDialogForm"
					onSubmit={(event) => {
						event.preventDefault();
						apply();
					}}
				>
					<Input
						ref={inputRef}
						className="editorLinkDialogInput"
						value={state?.href ?? ""}
						onChange={(event) =>
							onStateChange(
								state ? { ...state, href: event.target.value } : state,
							)
						}
						placeholder="https://example.com"
						aria-label="Link URL"
					/>
					<label className="editorLinkDialogCheckbox">
						<input
							type="checkbox"
							checked={state?.target === "_blank"}
							onChange={(event) =>
								onStateChange(
									state
										? {
												...state,
												target: event.target.checked ? "_blank" : "_self",
											}
										: state,
								)
							}
						/>
						<span>Open in new tab</span>
					</label>
					<DialogFooter className="editorLinkDialogActions">
						<Button type="button" variant="ghost" onClick={remove}>
							<X size="var(--icon-md)" />
							Remove
						</Button>
						<Button type="submit">Apply</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
