import { useRef } from "react";
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
					<DialogTitle>Extract to Note</DialogTitle>
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
							Title
						</label>
						<Input
							ref={titleInputRef}
							id="extract-to-note-title"
							className="extractToNoteInput extractToNoteTitleInput"
							value={state?.title ?? ""}
							onChange={(event) => onTitleChange(event.target.value)}
							placeholder="Note title"
							disabled={state?.loading}
						/>
					</div>
					<div className="extractToNoteField">
						<div className="extractToNoteLabel">Destination</div>
						{state ? (
							<DatabaseFolderPicker
								value={state.destinationDir}
								onChange={onDestinationDirChange}
								placeholder="Space root"
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
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={state?.loading || !state?.title.trim()}
						>
							{state?.loading ? "Creating" : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
