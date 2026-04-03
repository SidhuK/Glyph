import { Folder03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type FsEntry, invoke } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { ChevronRight, Search } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { ScrollArea } from "../ui/shadcn/scroll-area";

interface DatabaseFolderPickerProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	triggerClassName?: string;
}

interface FolderBrowserState {
	entries: FsEntry[];
	loading: boolean;
	error: string;
}

const EMPTY_BROWSER_STATE: FolderBrowserState = {
	entries: [],
	loading: false,
	error: "",
};

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
	placeholder = "Choose a folder",
	triggerClassName,
}: DatabaseFolderPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [browserPath, setBrowserPath] = useState(value);
	const [rootLoadFailed, setRootLoadFailed] = useState(false);
	const [browserState, setBrowserState] =
		useState<FolderBrowserState>(EMPTY_BROWSER_STATE);
	const { entries, loading, error } = browserState;

	useEffect(() => {
		if (!open) return;
		setBrowserPath(value);
		setQuery("");
		setRootLoadFailed(false);
	}, [open, value]);

	useEffect(() => {
		if (!open) return;
		if (!browserPath && rootLoadFailed) return;
		let cancelled = false;
		const loadEntries = async () => {
			setBrowserState((current) =>
				current.loading && !current.error
					? current
					: { ...current, loading: true, error: "" },
			);
			try {
				const nextEntries = await invoke("space_list_dir", {
					dir: browserPath || null,
				});
				if (cancelled) return;
				setBrowserState({
					entries: nextEntries.filter((entry) => entry.kind === "dir"),
					loading: false,
					error: "",
				});
				if (!browserPath) {
					setRootLoadFailed(false);
				}
			} catch (error) {
				if (cancelled) return;
				if (!browserPath) {
					setRootLoadFailed(true);
				}
				setBrowserState({
					entries: [],
					loading: false,
					error: extractErrorMessage(error),
				});
			}
		};
		void loadEntries();
		return () => {
			cancelled = true;
		};
	}, [browserPath, open, rootLoadFailed]);

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
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className={cn("databasePickerTrigger", triggerClassName)}
				>
					<span className="databasePickerTriggerIcon">
						<HugeiconsIcon icon={Folder03Icon} size={14} strokeWidth={1.7} />
					</span>
					<span className="databasePickerTriggerText">
						<span className="databasePickerTriggerLabel">{selectedLabel}</span>
						<span className="databasePickerTriggerMeta">{selectedMeta}</span>
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="folderPickerPopover" align="start">
				<div className="folderPickerBreadcrumbs">
					<button
						type="button"
						className="folderPickerCrumb"
						data-active={browserPath === "" ? "true" : undefined}
						onClick={() => setBrowserPath("")}
					>
						Root
					</button>
					{browserParts.map((part, index) => {
						const nextPath = browserParts.slice(0, index + 1).join("/");
						return (
							<span key={nextPath} className="folderPickerCrumbSegment">
								<ChevronRight size={10} />
								<button
									type="button"
									className="folderPickerCrumb"
									data-active={browserPath === nextPath ? "true" : undefined}
									onClick={() => setBrowserPath(nextPath)}
								>
									{part}
								</button>
							</span>
						);
					})}
				</div>
				<div className="folderPickerSearch">
					<Search size={12} />
					<Input
						value={query}
						placeholder="Filter…"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<ScrollArea className="folderPickerResults">
					<div className="folderPickerList">
						<button
							type="button"
							className="folderPickerSelect"
							onClick={() => {
								onChange(browserPath);
								setOpen(false);
							}}
						>
							<HugeiconsIcon icon={Folder03Icon} size={13} strokeWidth={1.7} />
							<span>{folderName(browserPath)}</span>
						</button>
						{loading ? (
							<div className="folderPickerEmpty">Loading…</div>
						) : error ? (
							<div className="folderPickerEmpty">{error}</div>
						) : filteredEntries.length > 0 ? (
							filteredEntries.map((entry) => (
								<button
									key={entry.rel_path}
									type="button"
									className="folderPickerRow"
									onClick={() => setBrowserPath(entry.rel_path)}
								>
									<span className="folderPickerRowName">{entry.name}</span>
									<ChevronRight size={12} />
								</button>
							))
						) : (
							<div className="folderPickerEmpty">No subfolders.</div>
						)}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}
