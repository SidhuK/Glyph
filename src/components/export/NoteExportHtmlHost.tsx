import "./exportDocument.css";

import { useEffect, useRef } from "react";
import { buildStandaloneExportHtml } from "../../lib/exportHtml";
import { parseNotePreview } from "../../lib/notePreview";
import { NoteExportDocument } from "./NoteExportDocument";

interface HtmlExportRequest {
	id: string;
	relPath: string;
	markdown: string;
}

interface NoteExportHtmlHostProps {
	request: HtmlExportRequest | null;
	onComplete: (result: { id: string; html: string }) => void;
	onError: (result: { id: string; message: string }) => void;
}

const IMAGE_SETTLE_TIMEOUT_MS = 5_000;
const HARD_TIMEOUT_MS = 30_000;

function isDirectImageUrl(src: string): boolean {
	return /^(https?:|data:|blob:|asset:|tauri:|file:|\/\/)/i.test(src);
}

export function NoteExportHtmlHost({
	request,
	onComplete,
	onError,
}: NoteExportHtmlHostProps) {
	const exportRootRef = useRef<HTMLElement | null>(null);
	const startedRef = useRef<string | null>(null);
	const completeRef = useRef(onComplete);
	const errorRef = useRef(onError);

	useEffect(() => {
		completeRef.current = onComplete;
	}, [onComplete]);

	useEffect(() => {
		errorRef.current = onError;
	}, [onError]);

	useEffect(() => {
		if (!request) return;

		startedRef.current = null;

		const startedAt = Date.now();
		let cancelled = false;
		let timer: number | null = null;
		const observer = new MutationObserver(() => {
			scheduleCheck();
		});

		const clearTimer = () => {
			if (timer !== null) {
				window.clearTimeout(timer);
				timer = null;
			}
		};

		const isSettled = () => {
			const root = exportRootRef.current;
			if (!root) return false;
			if (!root.querySelector(".rfNodeNoteEditor")) return false;
			const images = Array.from(root.querySelectorAll("img[src]"));
			const unresolvedLocal = images.some((image) => {
				const src = image.getAttribute("src")?.trim() ?? "";
				return Boolean(src) && !isDirectImageUrl(src);
			});
			if (unresolvedLocal && Date.now() - startedAt < IMAGE_SETTLE_TIMEOUT_MS) {
				return false;
			}
			const incomplete = images.some(
				(image) => !(image instanceof HTMLImageElement) || !image.complete,
			);
			if (incomplete && Date.now() - startedAt < IMAGE_SETTLE_TIMEOUT_MS) {
				return false;
			}
			return true;
		};

		const runCheck = () => {
			clearTimer();
			if (cancelled) return;
			if (Date.now() - startedAt > HARD_TIMEOUT_MS) {
				errorRef.current({
					id: request.id,
					message: "Export timed out waiting for the note to render.",
				});
				return;
			}
			if (isSettled()) {
				if (startedRef.current === request.id) return;
				startedRef.current = request.id;
				try {
					const exportRoot = exportRootRef.current;
					if (!exportRoot) {
						throw new Error("Export view did not finish rendering.");
					}
					const { title } = parseNotePreview(request.relPath, request.markdown);
					completeRef.current({
						id: request.id,
						html: buildStandaloneExportHtml(
							title,
							exportRoot.outerHTML,
							"html",
						),
					});
				} catch (error) {
					errorRef.current({
						id: request.id,
						message:
							error instanceof Error
								? error.message
								: "Failed to render HTML export.",
					});
				}
				return;
			}
			scheduleCheck();
		};

		const scheduleCheck = () => {
			clearTimer();
			timer = window.setTimeout(runCheck, 160);
		};

		if (exportRootRef.current) {
			observer.observe(exportRootRef.current, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["src", "class", "style"],
			});
		}
		scheduleCheck();

		return () => {
			cancelled = true;
			clearTimer();
			observer.disconnect();
		};
	}, [request]);

	if (!request) return null;

	return (
		<div className="noteExportMeasureHost" aria-hidden="true">
			<section
				ref={(node) => {
					exportRootRef.current = node;
				}}
			>
				<NoteExportDocument
					relPath={request.relPath}
					markdown={request.markdown}
				/>
			</section>
		</div>
	);
}
