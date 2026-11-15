import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import {
	type CommunityAction,
	loadAndClaimCommunityInvite,
	recordCommunityAction,
} from "../../lib/communityInvite";
import { extractErrorMessage } from "../../lib/errorUtils";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import { loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { SETTINGS_QUERY_KEY } from "../../lib/settingsStore";
import { toast } from "../../lib/toast";

const COMMUNITY_INVITE_QUERY_KEY = ["community-invite"] as const;

export const COMMUNITY_ACTION_URLS: Record<CommunityAction, string> = {
	starred: GLYPH_LINKS.github,
	joined: GLYPH_LINKS.discord,
};

/**
 * Invite state shared by the launch dialog and Settings › About. The query runs
 * once per window (it claims the invite when due), so later reads never re-open it.
 */
export function useCommunityInvite() {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	const inviteQuery = useQuery({
		queryKey: COMMUNITY_INVITE_QUERY_KEY,
		queryFn: loadAndClaimCommunityInvite,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
	const settingsQuery = useQuery({
		queryKey: SETTINGS_QUERY_KEY,
		queryFn: () => loadSettings(),
	});

	const act = useMutation({
		mutationFn: async (action: CommunityAction) => {
			await openUrl(COMMUNITY_ACTION_URLS[action]);
			return recordCommunityAction(action);
		},
		onSuccess: (state) => {
			queryClient.setQueryData(COMMUNITY_INVITE_QUERY_KEY, (previous) =>
				previous ? { ...previous, state } : previous,
			);
		},
		onError: (error) =>
			toast.error(t("community.errors.openFailed"), { description: extractErrorMessage(error) }),
	});

	const setEnabled = useMutation({
		mutationFn: (enabled: boolean) => DURABLE_SETTINGS.communityInvite.write(enabled),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
	});

	return {
		showOnLaunch: inviteQuery.data?.show ?? false,
		starred: inviteQuery.data?.state.starred ?? false,
		joined: inviteQuery.data?.state.joined ?? false,
		enabled:
			settingsQuery.data?.ui.communityInvite ?? DURABLE_SETTINGS.communityInvite.defaultValue,
		settingsLoaded: settingsQuery.data !== undefined,
		act,
		setEnabled,
	};
}
