import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Maximize2 } from "./Icons";

type PreviewKind = "image" | "pdf" | "audio" | "video" | "text" | "url" | "other";

function extOf(relPath: string): string {
	const name = relPath.split("/").pop() ?? relPath;
	const idx = name.lastIndexOf(".");
	if (idx <= 0) return "";
	return name.slice(idx + 1).toLowerCase();
}

function guessKind(relPath: string): PreviewKind {
	const ext = extOf(relPath);
	if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
	if (ext === "pdf") return "pdf";
	if (["mp3", "wav", "m4a", "ogg"].includes(ext)) return "audio";
	if (["mp4", "mov", "webm", "mkv"].includes(ext)) return "video";
	if (["txt", "md", "json", "yaml", "yml"].includes(ext)) return "text";
	if (relPath.startsWith("http://") || relPath.startsWith("https://")) return "url";
	return "other";
}

interface FilePreviewPaneProps {
	vaultPath: string | null;
	relPath: string | null;
}

export const FilePreviewPane = memo(function FilePreviewPane({
	vaultPath,
	relPath,
}: FilePreviewPaneProps) {
	const kind = useMemo(() => (relPath ? guessKind(relPath) : "other"), [relPath]);
	const [src, setSrc] = useState<string>("");
	const [absPath, setAbsPath] = useState<string>("");

	useEffect(() => {
		let cancelled = false;
		setSrc("");
		setAbsPath("");
		if (!vaultPath || !relPath) return;
		(async () => {
			const abs = await join(vaultPath, relPath);
			if (cancelled) return;
			setAbsPath(abs);
			setSrc(convertFileSrc(abs));
		})();
		return () => {
			cancelled = true;
		};
	}, [relPath, vaultPath]);

	const openExternal = useCallback(async () => {
		if (!relPath) return;
		if (kind === "url") {
			await openUrl(relPath);
			return;
		}
		if (!absPath) return;
		await openPath(absPath);
	}, [absPath, kind, relPath]);

	if (!relPath) {
		return (
			<section className="editorPane">
				<div className="editorEmpty">Select a file to preview.</div>
			</section>
		);
	}

	const title = relPath.split("/").pop() || relPath;

	return (
		<section className="editorPane">
			<div className="editorHeader">
				<div className="editorTitle" title={relPath}>
					{title}
				</div>
				<div className="editorActions">
					<button
						type="button"
						className="iconBtn"
						onClick={() => void openExternal()}
						title="Open in default app"
					>
						<Maximize2 size={16} />
					</button>
				</div>
			</div>

			<div className="editorBody">
				{kind === "image" && src ? (
					<div className="filePreviewCentered">
						<img className="filePreviewImage" alt="" src={src} />
					</div>
				) : null}

				{kind === "pdf" && src ? (
					<iframe className="filePreviewFrame" title={title} src={src} />
				) : null}

				{kind === "audio" && src ? (
					<div className="filePreviewCentered">
						<audio controls src={src} />
					</div>
				) : null}

				{kind === "video" && src ? (
					<div className="filePreviewCentered">
						<video controls className="filePreviewVideo" src={src} />
					</div>
				) : null}

				{kind === "other" ? (
					<div className="filePreviewMeta">
						<div className="filePreviewLabel mono">{relPath}</div>
						<div className="filePreviewHint">
							No in-app preview for this file type yet.
						</div>
					</div>
				) : null}
			</div>
		</section>
	);
});
