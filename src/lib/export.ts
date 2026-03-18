import { titleForFile } from "./notePreview";

function normalizeExportPath(path: string): string {
	const normalized = path.trim();
	if (!normalized) return normalized;
	return /\.(html|htm)$/i.test(normalized) ? normalized : `${normalized}.html`;
}

export async function promptNoteExportPath(
	relPath: string,
): Promise<string | null> {
	const { save } = await import("@tauri-apps/plugin-dialog");
	const selection = await save({
		title: "Export note as HTML",
		defaultPath: `${titleForFile(relPath)}.html`,
		filters: [{ name: "HTML", extensions: ["html", "htm"] }],
	});
	const chosen = Array.isArray(selection) ? (selection[0] ?? null) : selection;
	return chosen ? normalizeExportPath(chosen) : null;
}
