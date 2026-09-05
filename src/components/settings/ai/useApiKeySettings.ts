import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "../../../lib/errorUtils";
import { invoke } from "../../../lib/tauri";

const KEY_SAVED_FEEDBACK_MS = 3000;

function secretStatusQueryKey(profileId: string) {
	return ["ai", "secret-status", profileId] as const;
}

export function useApiKeySettings(activeProfileId: string | null) {
	const [apiKeyDraft, setApiKeyDraftState] = useState("");
	const [keySaved, setKeySaved] = useState(false);
	const [error, setError] = useState("");
	const queryClient = useQueryClient();
	const keySavedTimeoutRef = useRef<number | null>(null);
	const secretStatusQuery = useQuery({
		queryKey: secretStatusQueryKey(activeProfileId ?? ""),
		queryFn: () =>
			invoke("ai_secret_status", {
				profile_id: activeProfileId ?? "",
			}),
		enabled: Boolean(activeProfileId),
	});

	useEffect(
		() => () => {
			if (keySavedTimeoutRef.current !== null) {
				window.clearTimeout(keySavedTimeoutRef.current);
			}
		},
		[],
	);

	const setApiKeyDraft = useCallback((value: string) => {
		setApiKeyDraftState(value);
	}, []);

	const setApiKeyMutation = useMutation({
		mutationFn: ({
			profileId,
			apiKey,
		}: { profileId: string; apiKey: string }) =>
			invoke("ai_secret_set", {
				profile_id: profileId,
				api_key: apiKey,
			}),
		onSuccess: async (_result, variables) => {
			queryClient.setQueryData(secretStatusQueryKey(variables.profileId), true);
			await queryClient.invalidateQueries({
				queryKey: ["ai", "models", variables.profileId],
			});
		},
	});

	const clearApiKeyMutation = useMutation({
		mutationFn: (profileId: string) =>
			invoke("ai_secret_clear", { profile_id: profileId }),
		onSuccess: async (_result, profileId) => {
			queryClient.setQueryData(secretStatusQueryKey(profileId), false);
			await queryClient.invalidateQueries({
				queryKey: ["ai", "models", profileId],
			});
		},
	});

	const handleSetApiKey = useCallback(async () => {
		if (!activeProfileId || !apiKeyDraft.trim()) return;
		const profileId = activeProfileId;
		setError("");
		try {
			await setApiKeyMutation.mutateAsync({
				profileId,
				apiKey: apiKeyDraft,
			});
			setApiKeyDraftState("");
			setKeySaved(true);
			if (keySavedTimeoutRef.current !== null) {
				window.clearTimeout(keySavedTimeoutRef.current);
			}
			keySavedTimeoutRef.current = window.setTimeout(() => {
				setKeySaved(false);
			}, KEY_SAVED_FEEDBACK_MS);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [activeProfileId, apiKeyDraft, setApiKeyMutation]);

	const handleClearApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		const profileId = activeProfileId;
		setError("");
		try {
			await clearApiKeyMutation.mutateAsync(profileId);
			setApiKeyDraftState("");
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [activeProfileId, clearApiKeyMutation]);

	return {
		apiState: {
			apiKeyDraft,
			secretConfigured: activeProfileId
				? (secretStatusQuery.data ?? null)
				: null,
			keySaved,
			error,
		},
		setApiKeyDraft,
		handleSetApiKey,
		handleClearApiKey,
	};
}
