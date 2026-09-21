import { invoke } from "./tauri";

const PRINT_ROOT_ID = "glyph-native-print-document";
const PRINT_STYLE_ID = "glyph-native-print-styles";

function afterNextPaint(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

interface MountedPrintDocument {
	images: HTMLImageElement[];
	unmount: () => void;
}

function mountPrintDocument(html: string): MountedPrintDocument {
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
	const images = Array.from(printBody.querySelectorAll("img"));
	for (const image of images) image.loading = "eager";
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

	return {
		images,
		unmount: () => {
			printRoot.remove();
			printStyles.remove();
		},
	};
}

async function waitForImage(image: HTMLImageElement): Promise<void> {
	if (!image.complete) {
		await new Promise<void>((resolve) => {
			const finish = () => {
				image.removeEventListener("load", finish);
				image.removeEventListener("error", finish);
				resolve();
			};
			image.addEventListener("load", finish, { once: true });
			image.addEventListener("error", finish, { once: true });
			if (image.complete) finish();
		});
	}
	await image.decode().catch(() => undefined);
}

export async function openNativePrintDialog(html: string): Promise<void> {
	const { images, unmount } = mountPrintDocument(html);
	try {
		await document.fonts.ready;
		await afterNextPaint();
		await Promise.all(images.map(waitForImage));
		await invoke("document_print_current_window");
	} finally {
		unmount();
	}
}
