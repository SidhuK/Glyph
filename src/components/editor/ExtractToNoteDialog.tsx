import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { DatabaseFolderPicker } from "../database/DatabaseFolderPicker";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";
import { Input } from "../ui/shadcn/input";
import type { ExtractToNoteDialogState } from "./extractSelectionToNote";

interface ExtractToNoteDialogProps {
	onClose: () => void;
	onDestinationDirChange: (destinationDir: string) => void;
	onSubmit: () => Promise<void> | void;
	onTitleChange: (title: string) => void;
	state: ExtractToNoteDialogState | null;
}

export function ExtractToNoteDialog({
	onClose,
	onDestinationDirChange,
	onSubmit,
	onTitleChange,
	state,
}: ExtractToNoteDialogProps) {
	const { t } = useTranslation("ui");
	const titleInputRef = useRef<HTMLInputElement | null>(null);

	return (
		<Dialog
			open={state !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className="extractToNoteDialog databaseDialogCompact"
				onOpenAutoFocus={(event) => {
					const input = titleInputRef.current;
					if (!input) return;
					event.preventDefault();
					input.focus();
					input.select();
				}}
			>
				<DialogHeader className="extractToNoteHeader">
					<DialogTitle>{t("editor.extractToNote")}</DialogTitle>
				</DialogHeader>
				<form
					className="extractToNoteForm"
					onSubmit={(event) => {
						event.preventDefault();
						void onSubmit();
					}}
				>
					<div className="extractToNoteField">
						<label
							className="extractToNoteLabel"
							htmlFor="extract-to-note-title"
						>
							{t("editor.title")}
						</label>
						<Input
							ref={titleInputRef}
							id="extract-to-note-title"
							className="extractToNoteInput extractToNoteTitleInput"
							value={state?.title ?? ""}
							onChange={(event) => onTitleChange(event.target.value)}
							placeholder={t("editor.noteTitle")}
							disabled={state?.loading}
						/>
					</div>
					<div className="extractToNoteField">
						<div className="extractToNoteLabel">{t("editor.destination")}</div>
						{state ? (
							<DatabaseFolderPicker
								value={state.destinationDir}
								onChange={onDestinationDirChange}
								placeholder={t("editor.spaceRoot")}
								triggerClassName="extractToNoteFolderTrigger"
							/>
						) : null}
					</div>
					<DialogFooter className="extractToNoteActions">
						<Button
							type="button"
							variant="ghost"
							onClick={onClose}
							disabled={state?.loading}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="submit"
							disabled={state?.loading || !state?.title.trim()}
						>
							{state?.loading ? t("common.creating") : t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
