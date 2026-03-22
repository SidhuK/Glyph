export const MERMAID_CODE_BLOCK_LANGUAGE = "mermaid" as const;

export type MermaidThemeName = "default" | "dark";

type MermaidModule = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidModule> | null = null;
let initializedTheme: MermaidThemeName | null = null;
let renderSequence = 0;

function isDocumentDarkTheme(): boolean {
	if (typeof document === "undefined") return false;
	const root = document.documentElement;
	const dataTheme = root.getAttribute("data-theme");
	if (dataTheme === "dark") return true;
	if (dataTheme === "light") return false;
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function getMermaidTheme(): MermaidThemeName {
	return isDocumentDarkTheme() ? "dark" : "default";
}

export function isMermaidCodeBlockLanguage(
	language: string | null | undefined,
): boolean {
	return language?.trim().toLowerCase() === MERMAID_CODE_BLOCK_LANGUAGE;
}

export function extractMermaidErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message.trim() || "Unable to render Mermaid diagram.";
	}
	if (typeof error === "string" && error.trim()) return error.trim();
	return "Unable to render Mermaid diagram.";
}

async function loadMermaid(): Promise<MermaidModule> {
	if (!mermaidPromise) {
		mermaidPromise = import("mermaid").then((module) => module.default);
	}
	return mermaidPromise;
}

async function getConfiguredMermaid(
	theme: MermaidThemeName,
): Promise<MermaidModule> {
	const mermaid = await loadMermaid();
	if (initializedTheme !== theme) {
		try {
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: "strict",
				theme,
			});
			initializedTheme = theme;
		} catch (error) {
			initializedTheme = null;
			throw error;
		}
	}
	return mermaid;
}

export async function renderMermaidDiagram(source: string): Promise<string> {
	const trimmed = source.trim();
	if (!trimmed) {
		throw new Error("Add Mermaid source to preview this diagram.");
	}

	const theme = getMermaidTheme();
	const mermaid = await getConfiguredMermaid(theme);
	await mermaid.parse(trimmed);

	const renderHost = document.createElement("div");
	renderHost.style.position = "absolute";
	renderHost.style.left = "-10000px";
	renderHost.style.top = "0";
	renderHost.style.width = "800px";
	renderHost.style.visibility = "hidden";
	renderHost.style.pointerEvents = "none";
	renderHost.setAttribute("aria-hidden", "true");
	document.body.append(renderHost);

	try {
		renderSequence += 1;
		const { svg } = await mermaid.render(
			`glyph-mermaid-${renderSequence}`,
			trimmed,
			renderHost,
		);
		return svg;
	} finally {
		renderHost.remove();
	}
}
