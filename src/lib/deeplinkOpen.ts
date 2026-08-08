import { i18n } from "../i18n";
import { isGlyphDeeplink } from "./deeplink";
import { extractErrorMessage } from "./errorUtils";
import { invoke } from "./tauri";
import { toast } from "./toast";

/**
 * Activate a `glyph://` link from inside the app. Routing lives natively so an
 * in-note link behaves exactly like the same URL opened from the OS; rejected
 * links come back asynchronously on the `deeplink:error` event.
 */
export async function openDeeplink(href: string): Promise<void> {
	if (!isGlyphDeeplink(href)) return;
	try {
		await invoke("deeplink_open", { url: href.trim() });
	} catch (error) {
		toast.error(i18n.t("shell:deeplink.openFailed"), {
			description: extractErrorMessage(error),
		});
	}
}
