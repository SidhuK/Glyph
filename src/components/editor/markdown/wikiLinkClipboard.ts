import { i18n } from "../../../i18n";
import { toast } from "../../../lib/toast";
import {
	wikiLinkAttrsToMarkdown,
	wikiTargetFromRelPath,
} from "./wikiLinkCodec";
import type { WikiLinkAnchorKind } from "./wikiLinkTypes";

export async function copyWikiLinkMarkdown(markdown: string): Promise<boolean> {
	try {
		const clipboard = navigator.clipboard;
		if (!clipboard?.writeText) {
			throw new Error("Clipboard is not available.");
		}
		await clipboard.writeText(markdown);
		toast.success(i18n.t("editor:wikiLink.copiedLink"));
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		toast.error(i18n.t("editor:wikiLink.copyFailed"), { description: message });
		return false;
	}
}

export function wikiLinkMarkdownForNote(options: {
	anchor?: string | null;
	anchorKind?: WikiLinkAnchorKind;
	relPath: string;
}): string {
	return wikiLinkAttrsToMarkdown({
		target: wikiTargetFromRelPath(options.relPath),
		alias: null,
		embed: false,
		anchorKind: options.anchorKind ?? "none",
		anchor: options.anchor ?? null,
	});
}
