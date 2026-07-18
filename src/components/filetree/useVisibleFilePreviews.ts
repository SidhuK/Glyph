import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { splitYamlFrontmatter } from "../../lib/notePreview";
import { invoke } from "../../lib/tauri";

const MARKDOWN_PREVIEW_MAX_BYTES = 4096;
const MARKDOWN_PREVIEW_LINE_LIMIT = 1;
/** Must match `TEXT_PREVIEW_BATCH_MAX_PATHS` in space_fs preview.rs. */
const TEXT_PREVIEW_BATCH_MAX_PATHS = 100;

function plainMarkdownLine(line: string): string {
	return line
		.replace(/^#{1,6}\s+/, "")
		.replace(/^>\s?/, "")
		.replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
		.replace(/^[-*+]\s+/, "")
		.replace(/^\d+\.\s+/, "")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[*_`~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function markdownPreviewSnippet(markdown: string): string {
	const { body } = splitYamlFrontmatter(markdown);
	const lines: string[] = [];
	let inFence = false;

	for (const rawLine of body.replace(/\r\n?/g, "\n").split("\n")) {
		const trimmed = rawLine.trim();
		if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
			inFence = !inFence;
			continue;
		}
		if (inFence || !trimmed) continue;
		const line = plainMarkdownLine(trimmed);
		if (!line) continue;
		lines.push(line);
		if (lines.length >= MARKDOWN_PREVIEW_LINE_LIMIT) break;
	}

	return lines.join(" ");
}

export function useVisibleFilePreviews(
	spacePath: string | null,
	focusedDirPath: string | null,
) {
	const [filePreviewsByPath, setFilePreviewsByPath] = useState<
		Record<string, string | null | undefined>
	>({});
	const [filePreviewPaths, setFilePreviewPaths] = useState<string[]>([]);
	const [filePreviewRefreshKey, setFilePreviewRefreshKey] = useState(0);
	const filePreviewRequestRef = useRef("");
	const previousSpacePathRef = useRef(spacePath);

	useEffect(() => {
		if (previousSpacePathRef.current === spacePath) return;
		previousSpacePathRef.current = spacePath;
		setFilePreviewPaths([]);
		setFilePreviewsByPath({});
	}, [spacePath]);

	const clearVisiblePreviewPaths = useCallback(() => {
		setFilePreviewPaths([]);
	}, []);

	const handleVisiblePreviewPathsChange = useCallback((paths: string[]) => {
		setFilePreviewPaths((current) => {
			if (
				current.length === paths.length &&
				current.every((path, index) => path === paths[index])
			) {
				return current;
			}
			return paths;
		});
	}, []);

	const invalidatePreviewForPath = useCallback(
		(relPath: string, removed: boolean) => {
			setFilePreviewsByPath((current) => {
				if (!(relPath in current)) return current;
				const next = { ...current };
				delete next[relPath];
				return next;
			});
			if (!removed && filePreviewPaths.includes(relPath)) {
				setFilePreviewRefreshKey((key) => key + 1);
			}
		},
		[filePreviewPaths],
	);

	const filePreviewRequestKey = useMemo(
		() => `${filePreviewRefreshKey}:${filePreviewPaths.join("\0")}`,
		[filePreviewPaths, filePreviewRefreshKey],
	);

	useEffect(() => {
		filePreviewRequestRef.current = filePreviewRequestKey;
		if (!spacePath || !focusedDirPath || filePreviewPaths.length === 0) {
			return;
		}

		const missingPaths = filePreviewPaths.filter(
			(path) =>
				filePreviewsByPath[path] === undefined ||
				filePreviewsByPath[path] === "",
		);
		if (missingPaths.length === 0) return;

		const chunks: string[][] = [];
		for (
			let offset = 0;
			offset < missingPaths.length;
			offset += TEXT_PREVIEW_BATCH_MAX_PATHS
		) {
			chunks.push(
				missingPaths.slice(offset, offset + TEXT_PREVIEW_BATCH_MAX_PATHS),
			);
		}

		let cancelled = false;
		void Promise.allSettled(
			chunks.map((chunkPaths) =>
				invoke("space_read_text_previews_batch", {
					paths: chunkPaths,
					max_bytes: MARKDOWN_PREVIEW_MAX_BYTES,
				}).then((results) => ({ chunkPaths, results })),
			),
		).then((settled) => {
			if (
				cancelled ||
				filePreviewRequestRef.current !== filePreviewRequestKey
			) {
				return;
			}
			setFilePreviewsByPath((prev) => {
				let changed = false;
				const next = { ...prev };
				for (const outcome of settled) {
					if (outcome.status !== "fulfilled") {
						console.warn("Failed to load file previews", outcome.reason);
						continue;
					}
					const { chunkPaths, results } = outcome.value;
					for (const [index, result] of results.entries()) {
						const path = chunkPaths[index] ?? result.rel_path;
						if (!path) continue;
						if (result.error === null && result.text !== null) {
							const snippet = markdownPreviewSnippet(result.text) || null;
							if (next[path] !== snippet) {
								next[path] = snippet;
								changed = true;
							}
						} else if (path in next) {
							delete next[path];
							changed = true;
						}
					}
				}
				return changed ? next : prev;
			});
		});

		return () => {
			cancelled = true;
		};
	}, [
		filePreviewPaths,
		filePreviewRequestKey,
		filePreviewsByPath,
		focusedDirPath,
		spacePath,
	]);

	return {
		filePreviewsByPath,
		clearVisiblePreviewPaths,
		handleVisiblePreviewPathsChange,
		invalidatePreviewForPath,
	};
}
