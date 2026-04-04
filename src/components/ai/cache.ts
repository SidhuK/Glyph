import { clearAiContextCache } from "./useAiContext";
import { clearAiHistoryCache } from "./useAiHistory";
import { clearAiProfilesCache } from "./useAiProfiles";

export function clearAiPanelCaches() {
	clearAiContextCache();
	clearAiHistoryCache();
	clearAiProfilesCache();
}
