import { invoke } from "./tauri";

const PRINT_ROOT_ID = "glyph-native-print-document";
const PRINT_STYLE_ID = "glyph-native-print-styles";
const PRINT_IMAGE_WAIT_TIMEOUT_MS = 10_000;

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

function waitForImage(image: HTMLImageElement): Promise<void> {
	return new Promise((resolve) => {
		let timeoutId: number | null = null;
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			if (timeoutId !== null) window.clearTimeout(timeoutId);
			image.removeEventListener("load", handleLoad);
			image.removeEventListener("error", finish);
			resolve();
		};
		const handleLoad = () => {
			void image
				.decode()
				.catch(() => undefined)
				.then(finish);
		};
		image.addEventListener("load", handleLoad, { once: true });
		image.addEventListener("error", finish, { once: true });
		timeoutId = window.setTimeout(finish, PRINT_IMAGE_WAIT_TIMEOUT_MS);
		if (image.complete) handleLoad();
	});
}

export async function openNativePrintDialog(html: string): Promise<void> {
	if (document.getElementById(PRINT_ROOT_ID) || document.getElementById(PRINT_STYLE_ID)) {
		throw new Error("A native print operation is already in progress.");
	}
	const { images, unmount } = mountPrintDocument(html);
	window.addEventListener("afterprint", unmount, { once: true });
	try {
		await document.fonts.ready;
		await afterNextPaint();
		await Promise.all(images.map(waitForImage));
		await invoke("document_print_current_window");
	} catch (error) {
		window.removeEventListener("afterprint", unmount);
		unmount();
		throw error;
	}
}
