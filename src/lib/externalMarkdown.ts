import { isMarkdownPath } from "../utils/path";
import { extractErrorMessage } from "./errorUtils";
import { invoke } from "./tauri";
import { toast } from "./toast";

export async function openMarkdownInExternalWindow(
	relPath: string,
): Promise<void> {
	if (!isMarkdownPath(relPath)) return;
	try {
		await invoke("open_external_markdown_path", { path: relPath });
	} catch (error) {
		const message = extractErrorMessage(error);
		toast.error("Could not open in new window", { description: message });
	}
}
