import { agentCanvasSkeletons } from "./excalidrawDocument";

const THUMBNAIL_PADDING = 16;

/** Renders a saved drawing to an SVG data URL; loads Excalidraw on first use. */
export async function excalidrawThumbnailUrl(text: string, darkMode: boolean): Promise<string> {
	const { convertToExcalidrawElements, exportToSvg, loadFromBlob } =
		await import("@excalidraw/excalidraw");
	const skeletons = agentCanvasSkeletons(text);
	const scene = skeletons
		? { elements: convertToExcalidrawElements(skeletons), files: {} }
		: await loadFromBlob(new Blob([text], { type: "application/json" }), null, null);
	const svg = await exportToSvg({
		elements: scene.elements,
		files: scene.files,
		appState: { exportBackground: false, exportWithDarkMode: darkMode },
		exportPadding: THUMBNAIL_PADDING,
	});
	const markup = new XMLSerializer().serializeToString(svg);
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}
