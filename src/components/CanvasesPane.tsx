import { memo, useEffect, useMemo, useState } from "react";
import type { CanvasLibraryMeta } from "../lib/canvases";
import { type FsEntry, invoke } from "../lib/tauri";
import { Layout, Plus } from "./Icons";
import { Button } from "./ui/shadcn/button";
import { Input } from "./ui/shadcn/input";

interface CanvasesPaneProps {
	canvases: CanvasLibraryMeta[];
	activeCanvasId: string | null;
	onSelectCanvas: (id: string) => void;
	onCreateCanvas: () => void;
	onAddNotesToCanvas: (paths: string[]) => Promise<void>;
	onCreateNoteInCanvas: () => void;
	onRenameCanvas: (id: string, title: string) => Promise<void>;
}

export const CanvasesPane = memo(function CanvasesPane({
	canvases,
	activeCanvasId,
	onSelectCanvas,
	onCreateCanvas,
	onAddNotesToCanvas,
	onCreateNoteInCanvas,
	onRenameCanvas,
}: CanvasesPaneProps) {
	const [allFiles, setAllFiles] = useState<FsEntry[]>([]);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [pickerQuery, setPickerQuery] = useState("");
	const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
	const [pickerBusy, setPickerBusy] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const files = await invoke("vault_list_files", {
					dir: null,
					recursive: true,
					limit: 20_000,
				});
				if (cancelled) return;
				setAllFiles(files.filter((entry) => entry.kind === "file"));
			} catch {
				if (cancelled) return;
				setAllFiles([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return canvases;
		return canvases.filter((item) => item.title.toLowerCase().includes(q));
	}, [canvases, query]);

	const pickerCandidates = useMemo(() => {
		const source = allFiles.filter((entry) => entry.is_markdown);
		const q = pickerQuery.trim().toLowerCase();
		const matched = q
			? source.filter((entry) => entry.rel_path.toLowerCase().includes(q))
			: source;
		return matched.slice(0, 700);
	}, [allFiles, pickerQuery]);

	const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

	const toggleSelectedPath = (path: string) => {
		setSelectedPaths((prev) =>
			prev.includes(path) ? prev.filter((v) => v !== path) : [...prev, path],
		);
	};

	const openPicker = () => {
		setPickerOpen(true);
		setPickerQuery("");
		setSelectedPaths([]);
	};

	const submitPicker = async () => {
		if (selectedPaths.length === 0) return;
		setPickerBusy(true);
		try {
			await onAddNotesToCanvas(selectedPaths);
			setPickerOpen(false);
			setSelectedPaths([]);
			setPickerQuery("");
		} finally {
			setPickerBusy(false);
		}
	};

	const handleRenameCanvas = (canvas: CanvasLibraryMeta) => {
		const next = window.prompt("Rename canvas:", canvas.title || "Canvas");
		if (next == null) return;
		void onRenameCanvas(canvas.id, next);
	};

	return (
		<aside className="canvasesPane" data-window-drag-ignore>
			<div className="canvasesPaneHeader">
				<h2 className="canvasesPaneTitle">
					<Layout size={14} />
					Canvases
				</h2>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onCreateCanvas}
					title="New canvas"
					data-window-drag-ignore
				>
					<Plus size={16} />
				</Button>
			</div>
			<div className="canvasesActions">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={openPicker}
					data-window-drag-ignore
				>
					Add
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onCreateNoteInCanvas}
					data-window-drag-ignore
				>
					New Note
				</Button>
			</div>
			<div className="canvasesSearchWrap">
				<Input
					type="search"
					className="canvasesSearch"
					placeholder="Search canvases..."
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					data-window-drag-ignore
				/>
			</div>
			{pickerOpen ? (
				<div className="canvasPickerPanel" data-window-drag-ignore>
					<div className="canvasPickerHeader">
						<div className="canvasPickerTitle">Add Notes to Canvas</div>
						<div className="canvasPickerMeta">
							{selectedPaths.length} selected
						</div>
					</div>
					<Input
						type="search"
						className="canvasPickerSearch"
						placeholder="Search markdown notes..."
						value={pickerQuery}
						onChange={(event) => setPickerQuery(event.target.value)}
						data-window-drag-ignore
					/>
					<div className="canvasPickerList" data-window-drag-ignore>
						{pickerCandidates.length ? (
							pickerCandidates.map((entry) => (
								<button
									type="button"
									key={entry.rel_path}
									className="canvasPickerItem"
									onClick={() => toggleSelectedPath(entry.rel_path)}
									data-window-drag-ignore
								>
									<input
										type="checkbox"
										readOnly
										checked={selectedSet.has(entry.rel_path)}
										tabIndex={-1}
									/>
									<span className="mono">{entry.rel_path}</span>
								</button>
							))
						) : (
							<div className="canvasPickerEmpty">No matches.</div>
						)}
					</div>
					<div className="canvasPickerActions">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setPickerOpen(false)}
							data-window-drag-ignore
						>
							Cancel
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={() => void submitPicker()}
							disabled={!selectedPaths.length || pickerBusy}
							data-window-drag-ignore
						>
							{pickerBusy ? "Adding..." : "Add Selected"}
						</Button>
					</div>
				</div>
			) : null}
			<ul className="canvasesList" aria-label="Canvases">
				{filtered.map((c) => {
					const isActive = c.id === activeCanvasId;
					return (
						<li
							key={c.id}
							className={
								isActive ? "canvasesListItem active" : "canvasesListItem"
							}
						>
							<div className="canvasesListRow">
								<button
									type="button"
									className="canvasesListButton"
									onClick={() => onSelectCanvas(c.id)}
									aria-current={isActive ? "true" : undefined}
									data-window-drag-ignore
								>
									<div className="canvasesListTitle">{c.title || "Canvas"}</div>
									<div className="canvasesListMeta">
										{new Date(c.updated_at_ms).toLocaleString()}
									</div>
								</button>
								<button
									type="button"
									className="canvasesRenameBtn"
									onClick={() => handleRenameCanvas(c)}
									title="Rename canvas"
									data-window-drag-ignore
								>
									Rename
								</button>
							</div>
						</li>
					);
				})}
				{filtered.length === 0 ? (
					<li className="canvasesListEmpty">No canvases match.</li>
				) : null}
			</ul>
		</aside>
	);
});
