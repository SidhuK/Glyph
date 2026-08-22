import { clearAiPanelSession } from "./aiPanelSession";
import { clearAiContextCache } from "./useAiContext";
import { clearAiHistoryCache } from "./useAiHistory";
import { clearAiProfilesCache } from "./useAiProfiles";

export function clearAiPanelCaches() {
	clearAiPanelSession();
	clearAiContextCache();
	clearAiHistoryCache();
	clearAiProfilesCache();
}
