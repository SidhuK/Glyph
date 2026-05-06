import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type TextFilePreviewDoc, invoke } from "../../lib/tauri";
import { getInAppPreviewKind } from "../../utils/filePreview";
import { basename } from "../../utils/path";
import { ExternalLink, X } from "../Icons";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";
import { Button } from "../ui/shadcn/button";

interface FilePreviewPaneProps {
	relPath: string;
	onClose: () => void;
	onOpenExternally: (path: string) => Promise<void>;
}

const TEXT_PREVIEW_MAX_BYTES = 1_048_576;
const BINARY_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

function extensionLabel(fileName: string, fallback: string): string {
	const dot = fileName.lastIndexOf(".");
	if (dot <= 0 || dot === fileName.length - 1) return fallback;
	return fileName.slice(dot + 1).toLowerCase();
}

export function FilePreviewPane({
	relPath,
	onClose,
	onOpenExternally,
}: FilePreviewPaneProps) {
	const kind = getInAppPreviewKind(relPath);
	const displayName = basename(relPath);
	const { Icon, color, label } = getFileTypeInfo(relPath, false);
	const extLabel = extensionLabel(displayName, label);
	const [fileSrc, setFileSrc] = useState<string>("");
	const [textDoc, setTextDoc] = useState<TextFilePreviewDoc | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>("");

	const loadPreview = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			if (!kind) {
				setFileSrc("");
				setTextDoc(null);
				return;
			}
			if (kind === "text") {
				setFileSrc("");
				const next = await invoke("space_read_text_preview", {
					path: relPath,
					max_bytes: TEXT_PREVIEW_MAX_BYTES,
				});
				setTextDoc(next);
				return;
			}
			if (kind === "image" || kind === "pdf") {
				setTextDoc(null);
				const next = await invoke("space_read_binary_preview", {
					path: relPath,
					max_bytes: BINARY_PREVIEW_MAX_BYTES,
				});
				setFileSrc(next.data_url);
				return;
			}
		} catch (e) {
			setError(extractErrorMessage(e));
		} finally {
			setLoading(false);
		}
	}, [kind, relPath]);

	useEffect(() => {
		void loadPreview();
	}, [loadPreview]);

	return (
		<section className="filePreviewPane">
			<header className="filePreviewHeader">
				<div className="filePreviewActions">
					<Button
						type="button"
						size="sm"
						className="filePreviewActionButton"
						onClick={() => {
							setError("");
							void onOpenExternally(relPath).catch((e) => {
								setError(extractErrorMessage(e));
							});
						}}
					>
						<ExternalLink size={14} />
						<span>Open in Default App</span>
					</Button>
					<Button
						type="button"
						size="sm"
						className="filePreviewActionButton"
						onClick={onClose}
						aria-label="Close"
					>
						<X size={14} />
					</Button>
				</div>
			</header>

			{loading ? <div className="canvasEmpty">Loading preview…</div> : null}

			{!loading && error ? (
				<div className="filePreviewMeta">
					<div className="filePreviewHint">{error}</div>
				</div>
			) : null}

			{!loading && !error && !kind ? (
				<div className="filePreviewFallback">
					<div className="filePreviewFileLine" title={relPath}>
						<Icon
							size={16}
							className="filePreviewFileIcon"
							style={{ color }}
							aria-hidden="true"
						/>
						<span className="filePreviewFileName">{displayName}</span>
						<span className="fileTreeExtBadge">{extLabel}</span>
					</div>
				</div>
			) : null}

			{!loading && !error && kind === "image" && fileSrc ? (
				<div className="filePreviewCentered">
					<img className="filePreviewImage" alt={displayName} src={fileSrc} />
				</div>
			) : null}

			{!loading && !error && kind === "pdf" && fileSrc ? (
				<object
					className="filePreviewFrame"
					data={fileSrc}
					type="application/pdf"
				>
					<div className="filePreviewMeta">
						<div className="filePreviewHint">
							PDF preview unavailable in this environment. Use Open in Default
							App.
						</div>
					</div>
				</object>
			) : null}

			{!loading && !error && kind === "text" && textDoc ? (
				<div className="filePreviewTextWrap">
					<pre className="filePreviewText">{textDoc.text}</pre>
					{textDoc.truncated ? (
						<div className="filePreviewMeta">
							<div className="filePreviewHint">
								Showing first {textDoc.bytes_read.toLocaleString()} bytes of{" "}
								{textDoc.total_bytes.toLocaleString()} bytes.
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</section>
	);
}
