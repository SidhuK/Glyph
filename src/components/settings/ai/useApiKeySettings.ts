import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../../../lib/tauri";
import { errMessage } from "./utils";

interface ApiKeyState {
	apiKeyDraft: string;
	secretConfigured: boolean | null;
	keySaved: boolean;
	error: string;
}

export function useApiKeySettings(activeProfileId: string | null) {
	const [apiState, setApiState] = useState<ApiKeyState>({
		apiKeyDraft: "",
		secretConfigured: null,
		keySaved: false,
		error: "",
	});
	const queryClient = useQueryClient();
	const keySavedTimeoutRef = useRef<number | null>(null);
	const secretStatusQuery = useQuery({
		queryKey: ["ai", "secret-status", activeProfileId],
		queryFn: () =>
			invoke("ai_secret_status", {
				profile_id: activeProfileId ?? "",
			}),
		enabled: Boolean(activeProfileId),
	});

	useEffect(() => {
		setApiState((prev) => ({
			...prev,
			secretConfigured: activeProfileId
				? (secretStatusQuery.data ?? null)
				: null,
		}));
	}, [activeProfileId, secretStatusQuery.data]);

	useEffect(
		() => () => {
			if (keySavedTimeoutRef.current !== null) {
				window.clearTimeout(keySavedTimeoutRef.current);
			}
		},
		[],
	);

	const setApiKeyDraft = useCallback((value: string) => {
		setApiState((prev) => ({ ...prev, apiKeyDraft: value }));
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
			await queryClient.invalidateQueries({
				queryKey: ["ai", "secret-status", variables.profileId],
			});
			await queryClient.invalidateQueries({
				queryKey: ["ai", "models", variables.profileId],
			});
		},
	});

	const clearApiKeyMutation = useMutation({
		mutationFn: (profileId: string) =>
			invoke("ai_secret_clear", { profile_id: profileId }),
		onSuccess: async (_result, profileId) => {
			await queryClient.invalidateQueries({
				queryKey: ["ai", "secret-status", profileId],
			});
			await queryClient.invalidateQueries({
				queryKey: ["ai", "models", profileId],
			});
		},
	});

	const handleSetApiKey = useCallback(async () => {
		if (!activeProfileId || !apiState.apiKeyDraft.trim()) return;
		const profileId = activeProfileId;
		const apiKey = apiState.apiKeyDraft;
		setApiState((prev) => ({ ...prev, error: "" }));
		try {
			await setApiKeyMutation.mutateAsync({ profileId, apiKey });
			setApiState((prev) => ({
				...prev,
				apiKeyDraft: "",
				secretConfigured: true,
				keySaved: true,
			}));
			if (keySavedTimeoutRef.current !== null) {
				window.clearTimeout(keySavedTimeoutRef.current);
			}
			const timeout = window.setTimeout(() => {
				setApiState((prev) => ({ ...prev, keySaved: false }));
			}, 3000);
			keySavedTimeoutRef.current = timeout;
		} catch (error) {
			setApiState((prev) => ({ ...prev, error: errMessage(error) }));
		}
	}, [activeProfileId, apiState.apiKeyDraft, setApiKeyMutation]);

	const handleClearApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		const profileId = activeProfileId;
		setApiState((prev) => ({ ...prev, error: "" }));
		try {
			await clearApiKeyMutation.mutateAsync(profileId);
			setApiState((prev) => ({
				...prev,
				apiKeyDraft: "",
				secretConfigured: false,
			}));
		} catch (error) {
			setApiState((prev) => ({ ...prev, error: errMessage(error) }));
		}
	}, [activeProfileId, clearApiKeyMutation]);

	return {
		apiState,
		setApiKeyDraft,
		handleSetApiKey,
		handleClearApiKey,
	};
}
