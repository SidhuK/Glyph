import { invoke } from "./tauri";

const PRINT_ROOT_ID = "glyph-native-print-document";
const PRINT_STYLE_ID = "glyph-native-print-styles";

function afterNextPaint(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

function mountPrintDocument(html: string): () => void {
	document.getElementById(PRINT_ROOT_ID)?.remove();
	document.getElementById(PRINT_STYLE_ID)?.remove();

	const parsed = new DOMParser().parseFromString(html, "text/html");
	const printRoot = document.createElement("div");
	printRoot.id = PRINT_ROOT_ID;
	printRoot.style.cssText =
		"position: fixed; top: 0; left: -100000px; width: 800px; pointer-events: none;";
	const shadowRoot = printRoot.attachShadow({ mode: "closed" });
	const documentStyles = document.createElement("style");
	documentStyles.textContent = parsed.head.querySelector("style")?.textContent ?? "";
	const printBody = document.importNode(parsed.body, true);
	shadowRoot.append(documentStyles, printBody);

	const printStyles = document.createElement("style");
	printStyles.id = PRINT_STYLE_ID;
	printStyles.media = "print";
	printStyles.textContent = `
html, body {
	height: auto !important;
	overflow: visible !important;
	background: #ffffff !important;
}
#root {
	position: fixed !important;
	inset: 0 !important;
	width: 100% !important;
	height: 100% !important;
	visibility: hidden !important;
}
#${PRINT_ROOT_ID} {
	display: block !important;
	position: static !important;
	width: auto !important;
	visibility: visible !important;
	pointer-events: auto !important;
}`;
	document.body.append(printStyles, printRoot);

	return () => {
		printRoot.remove();
		printStyles.remove();
	};
}

export async function openNativePrintDialog(html: string): Promise<void> {
	const unmount = mountPrintDocument(html);
	window.addEventListener("afterprint", unmount, { once: true });
	try {
		await document.fonts.ready;
		await afterNextPaint();
		await invoke("document_print_current_window");
	} catch (error) {
		window.removeEventListener("afterprint", unmount);
		unmount();
		throw error;
	}
}
