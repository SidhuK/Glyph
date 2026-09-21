import { join } from "@tauri-apps/api/path";
import { useCallback } from "react";
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

	const exportPdf = useCallback(async () => {
		if (!activeNotePath) return;
		try {
			const markdown = await readNoteMarkdown(activeNotePath, getCurrentMarkdown);
			const html = await resolveDocumentImages(
				buildPrintHtml({ markdown, notePath: activeNotePath }),
				activeNotePath,
			);
			await openNativePrintDialog(html);
		} catch (error) {
			console.error("Failed to export note as PDF", error);
			toast.error(t("documentExport.pdfFailed"), {
				description: t("documentExport.tryAgain"),
			});
		}
	}, [activeNotePath, getCurrentMarkdown, t]);

	const exportDocx = useCallback(async () => {
		if (!activeNotePath || !spacePath) return;
		try {
			const fileName = displayNameFromPath(activeNotePath).trim() || t("documentExport.untitled");
			const { save } = await import("@tauri-apps/plugin-dialog");
			const selectedPath = await save({
				title: t("documentExport.docxDialogTitle"),
				defaultPath: await join(spacePath, `${fileName}.docx`),
				filters: [{ name: t("documentExport.docxFormat"), extensions: ["docx"] }],
			});
			if (!selectedPath) return;
			const destination = selectedPath.toLowerCase().endsWith(".docx")
				? selectedPath
				: `${selectedPath}.docx`;
			const markdown = await readNoteMarkdown(activeNotePath, getCurrentMarkdown);
			const html = await resolveDocumentImages(
				buildPrintHtml({ markdown, notePath: activeNotePath }),
				activeNotePath,
			);
			const { buildDocxBytes } = await import("../../lib/docxExport");
			const bytes = await buildDocxBytes(html, activeNotePath);
			await invoke("document_write_docx", {
				destination,
				bytes: Array.from(bytes),
			});
			toast.success(t("documentExport.docxComplete"));
		} catch (error) {
			console.error("Failed to export note as Word", error);
			toast.error(t("documentExport.docxFailed"), {
				description: t("documentExport.tryAgain"),
			});
		}
	}, [activeNotePath, getCurrentMarkdown, spacePath, t]);

	return { exportPdf, exportDocx };
}
