import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { resolveActiveProfileId } from "../../lib/aiProfiles";
import { extractErrorMessage } from "../../lib/errorUtils";
import { queryClient } from "../../lib/queryClient";
import { type AiProfile, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";

type AiProfilesBootstrap = {
	profiles: AiProfile[];
	activeProfileId: string | null;
	secretConfigured: boolean | null;
};

const aiProfilesQueryKey = ["ai", "profiles", "bootstrap"] as const;

async function fetchAiProfilesBootstrap(): Promise<AiProfilesBootstrap> {
	const [list, active] = await Promise.all([
		invoke("ai_profiles_list"),
		invoke("ai_active_profile_get"),
	]);
	const nextActive = resolveActiveProfileId(list, active);
	if (active !== nextActive && nextActive) {
		await invoke("ai_active_profile_set", { id: nextActive });
	}
	const secretConfigured = nextActive
		? await invoke("ai_secret_status", { profile_id: nextActive }).catch(
				() => null,
			)
		: null;
	return {
		profiles: list,
		activeProfileId: nextActive,
		secretConfigured,
	};
}

export function clearAiProfilesCache() {
	queryClient.removeQueries({ queryKey: aiProfilesQueryKey });
}

export function preloadAiProfilesData(): Promise<AiProfilesBootstrap> {
	return queryClient.fetchQuery({
		queryKey: aiProfilesQueryKey,
		queryFn: fetchAiProfilesBootstrap,
	});
}

function updateProfilesCache(
	updater: (current: AiProfilesBootstrap) => AiProfilesBootstrap,
) {
	queryClient.setQueryData<AiProfilesBootstrap>(aiProfilesQueryKey, (current) =>
		updater(
			current ?? {
				profiles: [],
				activeProfileId: null,
				secretConfigured: null,
			},
		),
	);
}

export function useAiProfiles() {
	const localQueryClient = useQueryClient();
	const profilesQuery = useQuery({
		queryKey: aiProfilesQueryKey,
		queryFn: fetchAiProfilesBootstrap,
	});

	useTauriEvent("ai:profiles-updated", () => {
		void localQueryClient.invalidateQueries({ queryKey: aiProfilesQueryKey });
	});

	const setActiveMutation = useMutation({
		mutationFn: (id: string | null) => invoke("ai_active_profile_set", { id }),
		onMutate: async (id) => {
			await localQueryClient.cancelQueries({ queryKey: aiProfilesQueryKey });
			const previous =
				localQueryClient.getQueryData<AiProfilesBootstrap>(aiProfilesQueryKey);
			updateProfilesCache((current) => ({
				...current,
				activeProfileId: id,
				secretConfigured:
					current.activeProfileId === id ? current.secretConfigured : null,
			}));
			return { previous };
		},
		onError: (_error, _id, context) => {
			if (context?.previous) {
				localQueryClient.setQueryData(aiProfilesQueryKey, context.previous);
			}
		},
		onSuccess: async () => {
			await localQueryClient.invalidateQueries({
				queryKey: aiProfilesQueryKey,
			});
		},
	});

	const setModelMutation = useMutation({
		mutationFn: async (modelId: string) => {
			const current =
				localQueryClient.getQueryData<AiProfilesBootstrap>(aiProfilesQueryKey);
			const profile = current?.profiles.find(
				(p) => p.id === current.activeProfileId,
			);
			if (!profile) return null;
			return invoke("ai_profile_upsert", {
				profile: { ...profile, model: modelId },
			});
		},
		onSuccess: (saved) => {
			if (!saved) return;
			updateProfilesCache((current) => ({
				...current,
				profiles: current.profiles.map((profile) =>
					profile.id === saved.id ? saved : profile,
				),
			}));
		},
	});

	const data = profilesQuery.data;
	const profiles = data?.profiles ?? [];
	const activeProfileId = data?.activeProfileId ?? null;
	const secretConfigured = data?.secretConfigured ?? null;
	const activeProfile = useMemo(() => {
		if (!activeProfileId) return null;
		return profiles.find((p) => p.id === activeProfileId) ?? null;
	}, [activeProfileId, profiles]);

	const setActive = useCallback(
		async (id: string | null) => {
			await setActiveMutation.mutateAsync(id);
		},
		[setActiveMutation],
	);

	const setModel = useCallback(
		async (modelId: string) => {
			await setModelMutation.mutateAsync(modelId);
		},
		[setModelMutation],
	);

	const error =
		(profilesQuery.error && extractErrorMessage(profilesQuery.error)) ||
		(setActiveMutation.error && extractErrorMessage(setActiveMutation.error)) ||
		(setModelMutation.error && extractErrorMessage(setModelMutation.error)) ||
		"";

	return {
		profiles,
		activeProfileId,
		activeProfile,
		setActive,
		setModel,
		secretConfigured,
		error,
	};
}
