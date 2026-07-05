import type { Editor } from "@tiptap/core";
import { type RefObject, useCallback, useState } from "react";
import { invoke } from "../../../lib/tauri";
import { toast } from "../../../lib/toast";
import {
	type ExtractToNoteDialogState,
	buildExtractSelectionDraft,
	buildExtractedNotePath,
	rewriteRelativeMarkdownLinks,
	sanitizeExtractedNoteTitle,
	uniqueExtractedNoteTitle,
} from "../extractSelectionToNote";
import type { ExtractToNoteActions } from "../types";

interface UseExtractSelectionToNoteArgs {
	actions?: ExtractToNoteActions;
	canEdit: boolean;
	editor: Editor | null;
	hostRef: RefObject<HTMLDivElement | null>;
	relPath?: string;
}

export function useExtractSelectionToNote({
	actions,
	canEdit,
	editor,
	hostRef,
	relPath,
}: UseExtractSelectionToNoteArgs) {
	const [dialogState, setDialogState] =
		useState<ExtractToNoteDialogState | null>(null);

	const canExtractToNote = canEdit && Boolean(relPath) && Boolean(actions);

	const loadUniqueExtractTitle = useCallback(
		async (title: string, destinationDir: string) => {
			const siblings = await invoke("space_list_dir", {
				dir: destinationDir || null,
			});
			return uniqueExtractedNoteTitle(
				title,
				siblings
					.filter((entry) => entry.kind === "file")
					.map((entry) => entry.name),
			);
		},
		[],
	);

	const openExtractDialog = useCallback(() => {
		if (!editor || !canExtractToNote || !relPath) {
			toast.error("Select text in an editable note first.");
			return;
		}
		const draft = buildExtractSelectionDraft(editor);
		if (!draft) {
			toast.error("Select text to extract.");
			return;
		}
		const destinationDir = relPath.includes("/")
			? relPath.slice(0, relPath.lastIndexOf("/"))
			: "";
		setDialogState({
			...draft,
			destinationDir,
			loading: true,
			title: sanitizeExtractedNoteTitle(draft.suggestedTitle),
		});
		void loadUniqueExtractTitle(draft.suggestedTitle, destinationDir)
			.then((title) => {
				setDialogState((current) =>
					current && current.range.from === draft.range.from
						? { ...current, loading: false, title }
						: current,
				);
			})
			.catch((error) => {
				console.error("Failed to suggest extracted note name", error);
				setDialogState((current) =>
					current && current.range.from === draft.range.from
						? { ...current, loading: false }
						: current,
				);
			});
	}, [canExtractToNote, editor, loadUniqueExtractTitle, relPath]);

	const closeExtractDialog = useCallback(() => {
		setDialogState(null);
	}, []);

	const setExtractTitle = useCallback((title: string) => {
		setDialogState((current) => (current ? { ...current, title } : current));
	}, []);

	const setExtractDestinationDir = useCallback((destinationDir: string) => {
		setDialogState((current) =>
			current ? { ...current, destinationDir } : current,
		);
	}, []);

	const submitExtractDialog = useCallback(async () => {
		if (!editor || !dialogState || !actions || !relPath) return;
		const requestedTitle = sanitizeExtractedNoteTitle(dialogState.title);
		if (!requestedTitle) return;
		setDialogState((current) =>
			current ? { ...current, loading: true } : current,
		);
		try {
			const finalTitle = await loadUniqueExtractTitle(
				requestedTitle,
				dialogState.destinationDir,
			);
			const notePath = buildExtractedNotePath(
				finalTitle,
				dialogState.destinationDir,
			);
			const noteMarkdown = rewriteRelativeMarkdownLinks(
				dialogState.markdown,
				relPath,
				dialogState.destinationDir,
			);
			const createdPath = await actions.createMarkdownFile({
				path: notePath,
				text: `${noteMarkdown.trimEnd()}\n`,
				openParentDir: dialogState.destinationDir,
			});
			if (!createdPath) {
				throw new Error("Could not create the extracted note.");
			}
			const scrollHost = hostRef.current?.closest(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
			const scrollTop = scrollHost?.scrollTop ?? 0;
			const inserted = editor
				.chain()
				.focus(null, { scrollIntoView: false })
				.insertContentAt(dialogState.range, `[[${finalTitle}]]`, {
					contentType: "markdown",
				})
				.run();
			if (!inserted) {
				setDialogState(null);
				toast.error("Note created, but selection was not replaced.", {
					className: "extractToNoteToast",
					description: finalTitle,
					action: {
						label: "Open",
						onClick: () => {
							void actions.openNote(createdPath);
						},
					},
				});
				return;
			}
			if (scrollHost) {
				requestAnimationFrame(() => {
					scrollHost.scrollTop = scrollTop;
				});
			}
			setDialogState(null);
			toast.success("Extracted to note", {
				className: "extractToNoteToast",
				description: finalTitle,
				action: {
					label: "Open",
					onClick: () => {
						void actions.openNote(createdPath);
					},
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("Failed to extract selection to note", error);
			toast.error("Could not extract to note", { description: message });
			setDialogState((current) =>
				current ? { ...current, loading: false } : current,
			);
		}
	}, [actions, dialogState, editor, hostRef, loadUniqueExtractTitle, relPath]);

	return {
		canExtractToNote,
		closeExtractDialog,
		dialogState,
		openExtractDialog,
		setExtractDestinationDir,
		setExtractTitle,
		submitExtractDialog,
	};
}
