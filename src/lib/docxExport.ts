import { displayNameFromPath } from "../utils/path";
import { invoke } from "./tauri";

function ensureConverterGlobals(buffer: typeof import("buffer").Buffer): void {
	if (!Object.prototype.hasOwnProperty.call(globalThis, "global")) {
		Object.defineProperty(globalThis, "global", {
			value: globalThis,
			configurable: true,
		});
	}
	if (!Object.prototype.hasOwnProperty.call(globalThis, "Buffer")) {
		Object.defineProperty(globalThis, "Buffer", {
			value: buffer,
			configurable: true,
		});
	}
}

async function prepareDocxHtml(html: string, spacePath: string): Promise<string> {
	const document = new DOMParser().parseFromString(html, "text/html");
	const images = Array.from(document.querySelectorAll("img"));
	const paths = Array.from(
		new Set(
			images
				.map((image) => image.getAttribute("data-glyph-export-path")?.trim() ?? "")
				.filter(Boolean),
		),
	);
	const dataByPath = new Map<string, string>();
	if (paths.length > 0) {
		const imageData = await invoke("document_read_images_batch", {
			expectedSpacePath: spacePath,
			paths,
		});
		for (const entry of imageData) {
			if (entry.dataUrl) dataByPath.set(entry.relPath, entry.dataUrl);
		}
	}
	for (const image of images) {
		const path = image.getAttribute("data-glyph-export-path")?.trim() ?? "";
		if (path) {
			const dataUrl = dataByPath.get(path);
			if (!dataUrl) throw new Error(`Could not read image: ${path}`);
			image.setAttribute("src", dataUrl);
			continue;
		}
		if (/^data:/i.test(image.getAttribute("src") ?? "")) continue;
		const alt = image.getAttribute("alt")?.trim();
		image.replaceWith(document.createTextNode(alt ? `[${alt}]` : ""));
	}
	return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

export async function buildDocxBytes(
	html: string,
	notePath: string,
	spacePath: string,
): Promise<Uint8Array> {
	const [{ Buffer }, preparedHtml] = await Promise.all([
		import("buffer"),
		prepareDocxHtml(html, spacePath),
	]);
	ensureConverterGlobals(Buffer);
	const { default: convertHtmlToDocx } = await import("@turbodocx/html-to-docx");
	const result = await convertHtmlToDocx(preparedHtml, null, {
		title: displayNameFromPath(notePath),
		creator: "Glyph",
		imageProcessing: { svgHandling: "native" },
	});
	if (result instanceof Blob) {
		return new Uint8Array(await result.arrayBuffer());
	}
	return new Uint8Array(result);
}
