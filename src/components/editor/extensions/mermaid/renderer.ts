import DOMPurify from "dompurify";
import { i18n } from "../../../../i18n";

const MERMAID_RENDER_CACHE_LIMIT = 50;

type MermaidRenderResult = { ok: true; svgHtml: string } | { ok: false; message: string };

interface MermaidDiagramFonts {
	fontFamily: string | undefined;
	fontFamilyMono: string | undefined;
}

const renderCache = new Map<string, MermaidRenderResult>();

function rememberRenderResult(key: string, result: MermaidRenderResult): MermaidRenderResult {
	if (renderCache.has(key)) {
		renderCache.delete(key);
	}
	renderCache.set(key, result);

	while (renderCache.size > MERMAID_RENDER_CACHE_LIMIT) {
		const oldestKey = renderCache.keys().next().value;
		if (oldestKey === undefined) break;
		renderCache.delete(oldestKey);
	}

	return result;
}

function renderFailedMessage(): string {
	return i18n.t("editor:codeBlock.mermaidRenderFailed");
}

// Must match the --pele-font/--pele-font-mono mapping in CSS: Pele sizes nodes
// by measuring labels in this font, so a mismatch clips or pads the text.
function readDiagramFonts(): MermaidDiagramFonts {
	const style = getComputedStyle(document.documentElement);
	return {
		fontFamily: style.getPropertyValue("--font-sans").trim() || undefined,
		fontFamilyMono: style.getPropertyValue("--font-mono").trim() || undefined,
	};
}

function fontKey({ fontFamily, fontFamilyMono }: MermaidDiagramFonts): string {
	return `${fontFamily ?? ""}|${fontFamilyMono ?? ""}`;
}

export function mermaidDiagramFontKey(): string {
	return fontKey(readDiagramFonts());
}

async function loadDiagramFonts({ fontFamily, fontFamilyMono }: MermaidDiagramFonts) {
	if (!document.fonts) return;
	const loads: Promise<unknown>[] = [];
	if (fontFamily) {
		loads.push(document.fonts.load(`16px ${fontFamily}`));
		loads.push(document.fonts.load(`bold 16px ${fontFamily}`));
	}
	if (fontFamilyMono) loads.push(document.fonts.load(`16px ${fontFamilyMono}`));
	// A font that fails to load still renders with its fallback; measurement then
	// uses the same fallback, so the diagram stays consistent.
	await Promise.allSettled(loads);
}

function sanitizeMermaidSvg(svg: string): MermaidRenderResult {
	const sanitizedSvg = DOMPurify.sanitize(svg, {
		USE_PROFILES: { svg: true, svgFilters: true },
		ADD_ATTR: ["role"],
		FORBID_TAGS: ["foreignObject", "script"],
	});

	if (typeof sanitizedSvg !== "string" || !sanitizedSvg.trim()) {
		return { ok: false, message: renderFailedMessage() };
	}

	const doc = new DOMParser().parseFromString(sanitizedSvg, "image/svg+xml");
	const root = doc.documentElement;
	if (root.tagName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
		return { ok: false, message: renderFailedMessage() };
	}

	return { ok: true, svgHtml: sanitizedSvg.trim() };
}

function errorMessage(error: unknown, PeleError: typeof import("pele/lazy").PeleError): string {
	if (error instanceof PeleError) {
		const message = error.message.trim() || renderFailedMessage();
		if (error.line <= 0 || message.includes(`line ${error.line}`)) return message;
		const location = i18n.t("editor:codeBlock.mermaidErrorLocation", {
			line: error.line,
			column: error.column,
		});
		return `${location}: ${message}`;
	}
	if (error instanceof Error && error.message.trim()) return error.message.trim();
	return renderFailedMessage();
}

export async function renderMermaidCanvasSvg(source: string): Promise<MermaidRenderResult> {
	const trimmedSource = source.trim();
	const fonts = readDiagramFonts();
	const cacheKey = `${fontKey(fonts)}\u0000${trimmedSource}`;
	const cachedResult = renderCache.get(cacheKey);
	if (cachedResult) {
		renderCache.delete(cacheKey);
		renderCache.set(cacheKey, cachedResult);
		return cachedResult;
	}

	if (!trimmedSource) {
		return rememberRenderResult(cacheKey, {
			ok: false,
			message: i18n.t("editor:codeBlock.mermaidEmpty"),
		});
	}

	// pele/lazy keeps Pele out of the startup chunk and loads each diagram type on first use.
	const { PeleError, renderAsync } = await import("pele/lazy");
	try {
		await loadDiagramFonts(fonts);
		const { svg } = await renderAsync(trimmedSource, {
			fontFamily: fonts.fontFamily,
			fontFamilyMono: fonts.fontFamilyMono,
			responsive: false,
			links: false,
			images: false,
		});
		return rememberRenderResult(cacheKey, sanitizeMermaidSvg(svg));
	} catch (error) {
		return rememberRenderResult(cacheKey, {
			ok: false,
			message: errorMessage(error, PeleError),
		});
	}
}

export function clearMermaidRenderCache(): void {
	renderCache.clear();
}
