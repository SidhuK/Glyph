import { isMarkdownPath } from "../utils/path";
import { extractErrorMessage } from "./errorUtils";
import { invoke } from "./tauri";
import { toast } from "./toast";

export async function openMarkdownInExternalWindow(
	relPath: string,
): Promise<void> {
	if (!isMarkdownPath(relPath)) return;
	try {
		const abs = await invoke("space_resolve_abs_path", { path: relPath });
		await invoke("open_external_markdown_path", { path: abs });
	} catch (error) {
		const message = extractErrorMessage(error);
		toast.error("Could not open in new window", { description: message });
	}
}
