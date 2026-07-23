import type { HtmlEmbedKind } from "@/lib/htmlEmbed";
import { isHtmlEmbedCodeBlockLanguage } from "@/lib/htmlEmbed";
import { isMermaidCodeBlockLanguage } from "@/lib/mermaid";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { createHtmlEmbedWidget } from "./extensions/htmlEmbed/sandbox";
import {
	createMermaidCanvas,
	createMermaidErrorCanvas,
} from "./extensions/mermaid/canvas";
import { renderMermaidCanvasSvg } from "./extensions/mermaid/renderer";

export interface FocusedCodeBlockPreview {
	pos: number;
	source: string;
	language: string | null;
}

function getPreviewKind(
	language: string | null,
): "mermaid" | HtmlEmbedKind | null {
	if (isMermaidCodeBlockLanguage(language)) return "mermaid";
	return isHtmlEmbedCodeBlockLanguage(language);
}

function FocusedMermaidPreview({ source }: { source: string }) {
	const mountRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount) return;
		const result = renderMermaidCanvasSvg(source);
		const canvas = result.ok
			? createMermaidCanvas({
					svgHtml: result.svgHtml,
					editMode: false,
				})
			: {
					element: createMermaidErrorCanvas(result.message),
					destroy: () => {},
				};
		mount.replaceChildren(canvas.element);
		return () => {
			canvas.destroy();
			mount.replaceChildren();
		};
	}, [source]);

	return <div ref={mountRef} className="focusedMermaidPreview" />;
}

function FocusedHtmlPreview({
	source,
	kind,
}: {
	source: string;
	kind: HtmlEmbedKind;
}) {
	const mountRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount) return;
		const widget = createHtmlEmbedWidget({
			source,
			kind,
			editable: false,
			onEditCode: () => {},
		});
		mount.replaceChildren(widget.element);
		return () => {
			widget.destroy();
			mount.replaceChildren();
		};
	}, [kind, source]);

	return <div ref={mountRef} className="focusedHtmlPreview" />;
}

export function FocusedCodeBlockPreviewDialog({
	preview,
	onClose,
}: {
	preview: FocusedCodeBlockPreview | null;
	onClose: () => void;
}) {
	const { t } = useTranslation("editor");
	const [themeVersion, setThemeVersion] = useState(0);
	const kind = getPreviewKind(preview?.language ?? null);

	useEffect(() => {
		if (!preview) return;
		const root = document.documentElement;
		const observer = new MutationObserver(() =>
			setThemeVersion((version) => version + 1),
		);
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["class", "data-theme"],
		});
		return () => observer.disconnect();
	}, [preview]);

	return (
		<Dialog open={preview !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="focusedCodeBlockPreviewDialog h-[min(780px,calc(100dvh-2rem))] max-w-[calc(100%-2rem)] p-3 sm:max-w-[min(1000px,calc(100%-2rem))]"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">
					{t("codeBlock.runPreview")}
				</DialogTitle>
				<div className="h-full">
					{preview && kind === "mermaid" ? (
						<FocusedMermaidPreview
							key={`${preview.source}-${themeVersion}`}
							source={preview.source}
						/>
					) : null}
					{preview && (kind === "html" || kind === "svg") ? (
						<FocusedHtmlPreview
							key={`${preview.source}-${themeVersion}`}
							source={preview.source}
							kind={kind}
						/>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
