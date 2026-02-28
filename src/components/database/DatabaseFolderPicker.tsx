import { useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type FsEntry, invoke } from "../../lib/tauri";
import { ChevronRight, FolderClosed, Search } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "../ui/shadcn/popover";
import { ScrollArea } from "../ui/shadcn/scroll-area";

interface DatabaseFolderPickerProps {
	value: string;
	onChange: (value: string) => void;
	label: string;
	description: string;
	placeholder?: string;
}

function folderParts(path: string): string[] {
	return path.split("/").filter(Boolean);
}

function folderName(path: string): string {
	if (!path) return "Space root";
	const parts = folderParts(path);
	return parts[parts.length - 1] ?? path;
}

function folderBreadcrumb(path: string): string {
	if (!path) return "Top level";
	const parts = folderParts(path);
	return parts.slice(0, -1).join(" / ") || "Top level";
}

export function DatabaseFolderPicker({
	value,
	onChange,
	label,
	description,
	placeholder = "Choose a folder",
}: DatabaseFolderPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [browserPath, setBrowserPath] = useState(value);
	const [entries, setEntries] = useState<FsEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!open) return;
		setBrowserPath(value);
		setQuery("");
	}, [open, value]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		const loadEntries = async () => {
			setLoading(true);
			setError("");
			try {
				const nextEntries = await invoke("space_list_dir", {
					dir: browserPath || null,
				});
				if (cancelled) return;
				setEntries(nextEntries.filter((entry) => entry.kind === "dir"));
			} catch (error) {
				if (cancelled) return;
				if (browserPath) {
					setBrowserPath("");
					return;
				}
				setEntries([]);
				setError(extractErrorMessage(error));
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void loadEntries();
		return () => {
			cancelled = true;
		};
	}, [browserPath, open]);

	const filteredEntries = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return entries;
		return entries.filter((entry) =>
			entry.name.toLowerCase().includes(normalized),
		);
	}, [entries, query]);

	const browserParts = folderParts(browserPath);
	const selectedLabel = value ? folderName(value) : placeholder;
	const selectedMeta = folderBreadcrumb(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="databasePickerTrigger"
				>
					<span className="databasePickerTriggerIcon">
						<FolderClosed size={13} />
					</span>
					<span className="databasePickerTriggerText">
						<span className="databasePickerTriggerLabel">{selectedLabel}</span>
						<span className="databasePickerTriggerMeta">{selectedMeta}</span>
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="databasePickerPopover" align="start">
				<PopoverHeader className="databasePickerHeader">
					<div className="databasePickerEyebrow">
						<FolderClosed size={13} />
						<span>Folder</span>
					</div>
					<PopoverTitle>{label}</PopoverTitle>
					<PopoverDescription>{description}</PopoverDescription>
				</PopoverHeader>
				<div className="databaseFolderBreadcrumbs">
					<button
						type="button"
						className="databaseFolderCrumb"
						data-active={browserPath === "" ? "true" : undefined}
						onClick={() => setBrowserPath("")}
					>
						Space root
					</button>
					{browserParts.map((part, index) => {
						const nextPath = browserParts.slice(0, index + 1).join("/");
						return (
							<div key={nextPath} className="databaseFolderCrumbSegment">
								<ChevronRight size={12} />
								<button
									type="button"
									className="databaseFolderCrumb"
									data-active={browserPath === nextPath ? "true" : undefined}
									onClick={() => setBrowserPath(nextPath)}
								>
									{part}
								</button>
							</div>
						);
					})}
				</div>
				<div className="databasePickerSearch">
					<Search size={13} />
					<Input
						value={query}
						placeholder="Filter this folder"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<div className="databaseFolderCurrent">
					<div className="databaseFolderCurrentMeta">
						<div className="databasePickerOptionLabel">
							{folderName(browserPath)}
						</div>
						<div className="databasePickerOptionMeta">
							{browserPath || "Space root"}
						</div>
					</div>
					<Button
						type="button"
						size="xs"
						onClick={() => {
							onChange(browserPath);
							setOpen(false);
						}}
					>
						Choose
					</Button>
				</div>
				<ScrollArea className="databasePickerResults">
					<div className="databasePickerList">
						{loading ? (
							<div className="databasePickerEmpty">Loading folders…</div>
						) : error ? (
							<div className="databasePickerEmpty">{error}</div>
						) : filteredEntries.length > 0 ? (
							filteredEntries.map((entry) => {
								const active = entry.rel_path === value;
								return (
									<button
										key={entry.rel_path}
										type="button"
										className="databasePickerOption"
										data-active={active ? "true" : undefined}
										onClick={() => setBrowserPath(entry.rel_path)}
									>
										<span className="databasePickerOptionMain">
											<span className="databasePickerOptionLabel">
												{entry.name}
											</span>
											<span className="databasePickerOptionMeta">
												Open folder
											</span>
										</span>
										<ChevronRight size={14} />
									</button>
								);
							})
						) : (
							<div className="databasePickerEmpty">
								No folders inside this location.
							</div>
						)}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
