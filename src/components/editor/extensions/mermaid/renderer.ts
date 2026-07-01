import { renderMermaidSVG } from "beautiful-mermaid";
import DOMPurify from "dompurify";
import { extractMermaidErrorMessage } from "../../../../lib/mermaid";

const MERMAID_RENDER_CACHE_LIMIT = 50;

type MermaidRenderResult =
	| { ok: true; svgHtml: string }
	| { ok: false; message: string };

const MERMAID_CANVAS_RENDER_OPTIONS = {
	bg: "var(--bg-primary)",
	fg: "var(--text-primary)",
	accent: "var(--interactive-accent)",
	muted: "var(--text-secondary)",
	border: "var(--border-default)",
	transparent: true,
} as const;

const renderCache = new Map<string, MermaidRenderResult>();

function rememberRenderResult(
	source: string,
	result: MermaidRenderResult,
): MermaidRenderResult {
	if (renderCache.has(source)) {
		renderCache.delete(source);
	}
	renderCache.set(source, result);

	while (renderCache.size > MERMAID_RENDER_CACHE_LIMIT) {
		const oldestKey = renderCache.keys().next().value;
		if (oldestKey === undefined) break;
		renderCache.delete(oldestKey);
	}

	return result;
}

function sanitizeMermaidSvg(svg: string): MermaidRenderResult {
	const sanitizedSvg = DOMPurify.sanitize(svg, {
		USE_PROFILES: { svg: true, svgFilters: true },
		FORBID_TAGS: ["foreignObject", "script"],
	});

	if (typeof sanitizedSvg !== "string" || !sanitizedSvg.trim()) {
		return { ok: false, message: "Unable to render Mermaid diagram." };
	}

	const doc = new DOMParser().parseFromString(sanitizedSvg, "image/svg+xml");
	const root = doc.documentElement;
	if (
		root.tagName.toLowerCase() !== "svg" ||
		doc.getElementsByTagName("parsererror").length > 0
	) {
		return { ok: false, message: "Unable to render Mermaid diagram." };
	}

	return { ok: true, svgHtml: sanitizedSvg.trim() };
}

export function renderMermaidCanvasSvg(source: string): MermaidRenderResult {
	const trimmedSource = source.trim();
	const cachedResult = renderCache.get(trimmedSource);
	if (cachedResult) {
		renderCache.delete(trimmedSource);
		renderCache.set(trimmedSource, cachedResult);
		return cachedResult;
	}

	if (!trimmedSource) {
		return rememberRenderResult(trimmedSource, {
			ok: false,
			message: "Add Mermaid source to preview this diagram.",
		});
	}

	try {
		const svg = renderMermaidSVG(trimmedSource, MERMAID_CANVAS_RENDER_OPTIONS);
		return rememberRenderResult(trimmedSource, sanitizeMermaidSvg(svg));
	} catch (error) {
		return rememberRenderResult(trimmedSource, {
			ok: false,
			message: extractMermaidErrorMessage(error),
		});
	}
}

export function clearMermaidRenderCache(): void {
	renderCache.clear();
}
