import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { openNativePrintDialog } from "../../lib/nativePrint";
import { buildPrintHtml, resolveDocumentImages } from "../../lib/printHtml";
import { invoke } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { displayNameFromPath } from "../../utils/path";

interface UseDocumentExportOptions {
	activeNotePath: string | null;
	spacePath: string | null;
	getCurrentMarkdown: (path: string) => string | null;
}

async function readNoteMarkdown(
	path: string,
	getCurrentMarkdown: (path: string) => string | null,
): Promise<string> {
	const currentMarkdown = getCurrentMarkdown(path);
	if (currentMarkdown !== null) return currentMarkdown;
	return (await invoke("space_read_text", { path })).text;
}

export function useDocumentExport({
	activeNotePath,
	spacePath,
	getCurrentMarkdown,
}: UseDocumentExportOptions) {
	const { t } = useTranslation("shell");
	const currentSpacePathRef = useRef(spacePath);
	currentSpacePathRef.current = spacePath;

	const ensureSpaceUnchanged = useCallback((expectedSpacePath: string) => {
		if (currentSpacePathRef.current !== expectedSpacePath) {
			throw new Error("The active space changed during document export.");
		}
	}, []);

	const exportPdf = useCallback(async () => {
		if (!activeNotePath || !spacePath) return;
		const exportSpacePath = spacePath;
		try {
			const markdown = await readNoteMarkdown(activeNotePath, getCurrentMarkdown);
			ensureSpaceUnchanged(exportSpacePath);
			const html = await resolveDocumentImages(
				buildPrintHtml({ markdown, notePath: activeNotePath }),
				activeNotePath,
				exportSpacePath,
			);
			ensureSpaceUnchanged(exportSpacePath);
			await openNativePrintDialog(html);
		} catch (error) {
			console.error("Failed to export note as PDF", error);
			toast.error(t("documentExport.pdfFailed"), {
				description: t("documentExport.tryAgain"),
			});
		}
	}, [activeNotePath, ensureSpaceUnchanged, getCurrentMarkdown, spacePath, t]);

	const exportDocx = useCallback(async () => {
		if (!activeNotePath || !spacePath) return;
		const exportSpacePath = spacePath;
		try {
			const fileName = displayNameFromPath(activeNotePath).trim() || t("documentExport.untitled");
			const markdown = await readNoteMarkdown(activeNotePath, getCurrentMarkdown);
			ensureSpaceUnchanged(exportSpacePath);
			const html = await resolveDocumentImages(
				buildPrintHtml({ markdown, notePath: activeNotePath }),
				activeNotePath,
				exportSpacePath,
			);
			ensureSpaceUnchanged(exportSpacePath);
			const { buildDocxBytes } = await import("../../lib/docxExport");
			const bytes = await buildDocxBytes(html, activeNotePath, exportSpacePath);
			ensureSpaceUnchanged(exportSpacePath);
			const saved = await invoke("document_write_docx", {
				bytes: Array.from(bytes),
				dialog_title: t("documentExport.docxDialogTitle"),
				expected_space_path: exportSpacePath,
				file_name: `${fileName}.docx`,
				format_name: t("documentExport.docxFormat"),
			});
			if (!saved) return;
			toast.success(t("documentExport.docxComplete"));
		} catch (error) {
			console.error("Failed to export note as Word", error);
			toast.error(t("documentExport.docxFailed"), {
				description: t("documentExport.tryAgain"),
			});
		}
	}, [activeNotePath, ensureSpaceUnchanged, getCurrentMarkdown, spacePath, t]);

	return { exportPdf, exportDocx };
}
