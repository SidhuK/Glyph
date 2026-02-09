import { useCallback, useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type TextFilePreviewDoc, invoke } from "../../lib/tauri";
import { getInAppPreviewKind } from "../../utils/filePreview";
import { Button } from "../ui/shadcn/button";

interface FilePreviewPaneProps {
	relPath: string;
	onClose: () => void;
	onOpenExternally: (path: string) => Promise<void>;
}

const TEXT_PREVIEW_MAX_BYTES = 1_048_576;
const BINARY_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

function filenameFromPath(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

export function FilePreviewPane({
	relPath,
	onClose,
	onOpenExternally,
}: FilePreviewPaneProps) {
	const kind = getInAppPreviewKind(relPath);
	const [fileSrc, setFileSrc] = useState<string>("");
	const [textDoc, setTextDoc] = useState<TextFilePreviewDoc | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>("");

	const displayName = useMemo(() => filenameFromPath(relPath), [relPath]);

	const loadPreview = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			if (kind === "text") {
				setFileSrc("");
				const next = await invoke("vault_read_text_preview", {
					path: relPath,
					max_bytes: TEXT_PREVIEW_MAX_BYTES,
				});
				setTextDoc(next);
				return;
			}
			if (kind === "image" || kind === "pdf") {
				setTextDoc(null);
				const next = await invoke("vault_read_binary_preview", {
					path: relPath,
					max_bytes: BINARY_PREVIEW_MAX_BYTES,
				});
				setFileSrc(next.data_url);
				return;
			}
			throw new Error("Unsupported preview type");
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
				<div className="filePreviewHeaderMeta">
					<div className="filePreviewLabel">Read-only preview</div>
					<div className="filePreviewName mono" title={relPath}>
						{displayName}
					</div>
				</div>
				<div className="filePreviewActions">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => void loadPreview()}
						disabled={loading}
					>
						Refresh
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							setError("");
							void onOpenExternally(relPath).catch((e) => {
								setError(extractErrorMessage(e));
							});
						}}
					>
						Open Externally
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={onClose}>
						Back to Canvas
					</Button>
				</div>
			</header>

			{loading ? <div className="canvasEmpty">Loading preview…</div> : null}

			{!loading && error ? (
				<div className="filePreviewMeta">
					<div className="filePreviewHint">{error}</div>
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
							PDF preview unavailable in this environment. Use Open Externally.
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
