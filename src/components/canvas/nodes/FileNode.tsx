import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";
import { invoke } from "../../../lib/tauri";
import { parentDir } from "../../../utils/path";
import { getInAppPreviewKind } from "../../../utils/filePreview";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../../ui/shadcn/context-menu";
import { useCanvasActions } from "../contexts";
import { getNodeRotation } from "../utils";

interface FileNodeProps {
	data: Record<string, unknown>;
	id: string;
	selected?: boolean;
}

const BINARY_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
const previewCache = new Map<string, string | null>();
const previewInflight = new Map<string, Promise<string | null>>();

async function loadPreviewDataUrl(path: string): Promise<string | null> {
	if (previewCache.has(path)) return previewCache.get(path) ?? null;
	const existing = previewInflight.get(path);
	if (existing) return existing;

	const request = (async () => {
		try {
			const doc = await invoke("vault_read_binary_preview", {
				path,
				max_bytes: BINARY_PREVIEW_MAX_BYTES,
			});
			const src = typeof doc?.data_url === "string" ? doc.data_url : null;
			previewCache.set(path, src);
			return src;
		} catch {
			previewCache.set(path, null);
			return null;
		} finally {
			previewInflight.delete(path);
		}
	})();
	previewInflight.set(path, request);
	return request;
}

function compactPath(path: string): string {
	if (!path) return "";
	const parts = path.split("/").filter(Boolean);
	if (parts.length <= 2) return path;
	return `${parts[0]}/…/${parts[parts.length - 1]}`;
}

function splitEditableFileName(name: string): { stem: string; ext: string } {
	const trimmed = name.trim();
	const dotIndex = trimmed.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
		return { stem: trimmed, ext: "" };
	}
	return {
		stem: trimmed.slice(0, dotIndex),
		ext: trimmed.slice(dotIndex),
	};
}

export const FileNode = memo(function FileNode({
	data,
	id,
	selected,
}: FileNodeProps) {
	const { openNote, newFileInDir, newFolderInDir, reflowGrid, renamePath } =
		useCanvasActions();
	const isFanNode = typeof data.fan_parent_folder_id === "string";
	const fanIndex = typeof data.fan_index === "number" ? data.fan_index : 0;
	const fanRotation =
		typeof data.fan_rotation === "number" ? data.fan_rotation : 0;
	const title =
		typeof data.title === "string"
			? data.title
			: typeof data.path === "string"
				? (data.path.split("/").pop() ?? data.path)
				: "File";
	const path = typeof data.path === "string" ? data.path : "";
	const storedImageSrc =
		typeof data.image_src === "string" ? data.image_src : null;
	const previewKind = path ? getInAppPreviewKind(path) : null;
	const isPreviewableMedia = previewKind === "image" || previewKind === "pdf";
	const [previewSrc, setPreviewSrc] = useState<string>(storedImageSrc ?? "");
	const overlaySub = useMemo(() => compactPath(path), [path]);
	const fileDir = useMemo(() => parentDir(path), [path]);
	const rotation = isFanNode ? fanRotation : getNodeRotation(id) * 0.8;
	const motionInitial = isFanNode
		? { opacity: 0, scale: 0.97, y: -12 }
		: { opacity: 0, scale: 0.95 };
	const motionAnimate = isFanNode
		? {
				opacity: 1,
				scale: 1,
				y: 0,
				boxShadow: selected
					? "0 0 0 2px var(--accent), 0 8px 16px rgba(0,0,0,0.12)"
					: "0 2px 8px rgba(0,0,0,0.1)",
			}
		: {
				opacity: 1,
				scale: 1,
				boxShadow: selected
					? "0 0 0 2px var(--accent), 0 4px 12px rgba(0,0,0,0.15)"
					: "0 2px 8px rgba(0,0,0,0.1)",
			};
	const motionTransition = isFanNode
		? ({
				type: "spring",
				stiffness: 340,
				damping: 30,
				delay: Math.min(0.18, fanIndex * 0.022),
			} as const)
		: ({ duration: 0.15 } as const);
	const pdfSrc = previewSrc
		? `${previewSrc}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`
		: "";
	const handleRename = () => {
		if (!path) return;
		const currentName = path.split("/").pop() ?? path;
		const { stem, ext } = splitEditableFileName(currentName);
		const nextStem = window.prompt("Rename file", stem || currentName);
		if (nextStem == null) return;
		const trimmed = nextStem.trim();
		if (!trimmed) return;
		void renamePath(path, `${trimmed}${ext}`, "file");
	};

	useEffect(() => {
		if (storedImageSrc) {
			setPreviewSrc(storedImageSrc);
			return;
		}
		if (!isPreviewableMedia || !path) {
			setPreviewSrc("");
			return;
		}

		let cancelled = false;
		void loadPreviewDataUrl(path).then((src) => {
			if (cancelled) return;
			setPreviewSrc(src ?? "");
		});
		return () => {
			cancelled = true;
		};
	}, [isPreviewableMedia, path, storedImageSrc]);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<motion.div
					className="rfNode rfNodeFile"
					title={path}
					style={{ transform: `rotate(${rotation}deg)` }}
					initial={motionInitial}
					animate={motionAnimate}
					transition={motionTransition}
				>
					<Handle type="target" position={Position.Left} />
					<Handle type="source" position={Position.Right} />
					{previewSrc && previewKind === "image" ? (
						<img className="rfNodeFileThumb" alt="" src={previewSrc} />
					) : null}
					{previewSrc && previewKind === "pdf" ? (
						<object className="rfNodeFilePdf" data={pdfSrc} type="application/pdf" />
					) : null}
					<div className="rfNodeFileOverlay">
						<div className="rfNodeTitle">{title}</div>
						<div className="rfNodeSub mono">{overlaySub}</div>
					</div>
				</motion.div>
			</ContextMenuTrigger>
			<ContextMenuContent className="fileTreeCreateMenu">
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() => {
						if (path) openNote(path);
					}}
				>
					Open
				</ContextMenuItem>
				<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={handleRename}
				>
					Rename
				</ContextMenuItem>
				<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() =>
						void (async () => {
							await newFileInDir(fileDir);
							reflowGrid();
						})()
					}
				>
					Add file
				</ContextMenuItem>
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() =>
						void (async () => {
							const created = await newFolderInDir(fileDir);
							if (created) reflowGrid();
						})()
					}
				>
					Add folder
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
});
