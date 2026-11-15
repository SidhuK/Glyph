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

/** The link opened, but saving that the user acted did not. */
class CommunityActionSaveError extends Error {}

/**
 * Whether the launch dialog is open in this window. The claim runs once per
 * window and lives in the app-wide query cache, so dismissing it survives the
 * shell remounting on a space switch. Only the dialog passes `claim: true`;
 * other callers just observe it.
 */
export function useCommunityInviteLaunch({ claim }: { claim: boolean }) {
	const queryClient = useQueryClient();
	const claimQuery = useQuery({
		queryKey: COMMUNITY_INVITE_CLAIM_QUERY_KEY,
		queryFn: claimCommunityInvite,
		enabled: claim,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
	const settingsQuery = useQuery({
		queryKey: SETTINGS_QUERY_KEY,
		queryFn: () => loadSettings(),
	});
	return {
		// Switching invitations off wins over a claim made before it, including in another window.
		open: (claimQuery.data ?? false) && settingsQuery.data?.ui.communityInvite === true,
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
			try {
				return await recordCommunityAction(action);
			} catch (error) {
				throw new CommunityActionSaveError(extractErrorMessage(error));
			}
		},
		onSuccess: async (state) => {
			// A read that started before the write (e.g. a refocus refetch) must not land after it.
			await queryClient.cancelQueries({ queryKey: COMMUNITY_INVITE_STATE_QUERY_KEY });
			queryClient.setQueryData(COMMUNITY_INVITE_STATE_QUERY_KEY, state);
		},
		onError: (error) =>
			toast.error(
				t(
					error instanceof CommunityActionSaveError
						? "community.errors.saveFailed"
						: "community.errors.openFailed",
				),
				{ description: extractErrorMessage(error) },
			),
	});

	const setEnabled = useMutation({
		mutationFn: (enabled: boolean) => DURABLE_SETTINGS.communityInvite.write(enabled),
		onSuccess: (_, enabled) => {
			// Turning invitations off retires this window's claim, so turning them back on can't reopen it.
			if (!enabled) queryClient.setQueryData(COMMUNITY_INVITE_CLAIM_QUERY_KEY, false);
			return queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
		},
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
