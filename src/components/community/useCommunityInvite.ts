import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import {
	type CommunityAction,
	claimCommunityInvite,
	loadCommunityInviteState,
	recordCommunityAction,
} from "../../lib/communityInvite";
import { extractErrorMessage } from "../../lib/errorUtils";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import { loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { SETTINGS_QUERY_KEY } from "../../lib/settingsStore";
import { toast } from "../../lib/toast";

const COMMUNITY_INVITE_STATE_QUERY_KEY = ["community-invite", "state"] as const;
const COMMUNITY_INVITE_CLAIM_QUERY_KEY = ["community-invite", "claim"] as const;

export const COMMUNITY_ACTION_URLS: Record<CommunityAction, string> = {
	starred: GLYPH_LINKS.github,
	joined: GLYPH_LINKS.discord,
};

/**
 * Whether the launch dialog is open in this window. The claim runs once per
 * window and lives in the app-wide query cache, so dismissing it survives the
 * shell remounting on a space switch.
 */
export function useCommunityInviteLaunch() {
	const queryClient = useQueryClient();
	const claimQuery = useQuery({
		queryKey: COMMUNITY_INVITE_CLAIM_QUERY_KEY,
		queryFn: claimCommunityInvite,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
	return {
		open: claimQuery.data ?? false,
		dismiss: () => queryClient.setQueryData(COMMUNITY_INVITE_CLAIM_QUERY_KEY, false),
	};
}

/** Invite state shared by the launch dialog and Settings › About. Never claims an invite. */
export function useCommunityInvite() {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	const stateQuery = useQuery({
		queryKey: COMMUNITY_INVITE_STATE_QUERY_KEY,
		queryFn: loadCommunityInviteState,
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
		onSuccess: (state) => queryClient.setQueryData(COMMUNITY_INVITE_STATE_QUERY_KEY, state),
		onError: (error) =>
			toast.error(t("community.errors.openFailed"), { description: extractErrorMessage(error) }),
	});

	const setEnabled = useMutation({
		mutationFn: (enabled: boolean) => DURABLE_SETTINGS.communityInvite.write(enabled),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
	});

	return {
		starred: stateQuery.data?.starred ?? false,
		joined: stateQuery.data?.joined ?? false,
		enabled:
			settingsQuery.data?.ui.communityInvite ?? DURABLE_SETTINGS.communityInvite.defaultValue,
		settingsLoaded: settingsQuery.data !== undefined,
		act,
		setEnabled,
	};
}
