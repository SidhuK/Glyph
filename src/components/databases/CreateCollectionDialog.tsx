import { LibraryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import {
	folderNameFromPath,
	nextCollectionName,
	normalizeCollectionFolderPath,
} from "../../lib/database/collection";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type WorkspaceDatabaseDocument,
	type WorkspaceDatabaseSummary,
	invoke,
} from "../../lib/tauri";
import { Kanban, Table } from "../Icons";
import { DatabaseFolderPicker } from "../database/DatabaseFolderPicker";
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

interface CreateCollectionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	summaries: WorkspaceDatabaseSummary[];
	onCreated: (document: WorkspaceDatabaseDocument) => void;
	onError: (message: string) => void;
}

const COLLECTION_TIPS = [
	{
		id: "scope",
		text: "Includes notes in this folder and its subfolders.",
	},
	{
		id: "views",
		text: "View them as a table or Kanban board.",
		icons: (
			<span className="createCollectionTipIcons" aria-hidden="true">
				<Table size="var(--icon-sm)" />
				<Kanban size="var(--icon-sm)" />
			</span>
		),
	},
	{
		id: "grouping",
		text: "Group the board by status, tags, or other fields on your notes.",
	},
	{
		id: "notes",
		text: "Notes you create here stay in the same folder.",
	},
] as const;

export function CreateCollectionDialog({
	open,
	onOpenChange,
	summaries,
	onCreated,
	onError,
}: CreateCollectionDialogProps) {
	const [folder, setFolder] = useState("");
	const [name, setName] = useState("");
	const [nameTouched, setNameTouched] = useState(false);
	const [loading, setLoading] = useState(false);
	const normalizedFolder = useMemo(
		() => normalizeCollectionFolderPath(folder),
		[folder],
	);

	useEffect(() => {
		if (!open) {
			setFolder("");
			setName("");
			setNameTouched(false);
			setLoading(false);
		}
	}, [open]);

	const handleFolderChange = (value: string) => {
		setFolder(value);
		if (!nameTouched) {
			setName(folderNameFromPath(value));
		}
	};

	const handleSubmit = async () => {
		if (!normalizedFolder) {
			onError("Choose a project folder.");
			return;
		}
		setLoading(true);
		try {
			const created = await invoke("databases_create", {
				name: nextCollectionName(
					summaries,
					name.trim() || folderNameFromPath(normalizedFolder),
				),
				folder: normalizedFolder,
			});
			onCreated(created);
			onOpenChange(false);
		} catch (cause) {
			onError(extractErrorMessage(cause));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="createCollectionDialog databaseDialogCompact"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
				}}
			>
				<div className="createCollectionHero">
					<div className="createCollectionIcon" aria-hidden="true">
						<HugeiconsIcon
							icon={LibraryIcon}
							size="var(--icon-xl)"
							strokeWidth={0.9}
						/>
					</div>
					<DialogHeader className="createCollectionHeader text-center sm:text-center items-center">
						<p className="createCollectionEyebrow">Collections</p>
						<DialogTitle>New collection</DialogTitle>
						<DialogDescription className="createCollectionDescription">
							A collection is just a group of notes in a folder. Pick the folder
							to get started.
						</DialogDescription>
					</DialogHeader>
				</div>

				<form
					className="createCollectionForm"
					onSubmit={(event) => {
						event.preventDefault();
						void handleSubmit();
					}}
				>
					<div className="createCollectionFields">
						<fieldset className="createCollectionField">
							<legend className="createCollectionLabel">Project folder</legend>
							<DatabaseFolderPicker
								value={folder}
								onChange={handleFolderChange}
								placeholder="Choose a folder"
								triggerClassName="createCollectionFolderTrigger"
							/>
						</fieldset>

						<label className="createCollectionField" htmlFor="collection-name">
							<span className="createCollectionLabel">Name</span>
							<Input
								id="collection-name"
								className="createCollectionInput"
								value={name}
								onChange={(event) => {
									setNameTouched(true);
									setName(event.target.value);
								}}
								placeholder="e.g. Product roadmap"
								disabled={loading}
							/>
						</label>
					</div>

					<div
						className="createCollectionTips"
						aria-label="How collections work"
					>
						<ul className="createCollectionTipsList">
							{COLLECTION_TIPS.map((tip) => (
								<li key={tip.id} className="createCollectionTip">
									{"icons" in tip ? tip.icons : null}
									<span>{tip.text}</span>
								</li>
							))}
						</ul>
					</div>

					<DialogFooter className="createCollectionActions">
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							disabled={loading}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							className="createCollectionCta"
							disabled={loading || !normalizedFolder}
						>
							{loading ? "Creating…" : "Create collection"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
