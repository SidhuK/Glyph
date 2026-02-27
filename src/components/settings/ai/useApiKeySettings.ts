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
	const activeProfileIdRef = useRef(activeProfileId);
	const keySavedTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		activeProfileIdRef.current = activeProfileId;
	}, [activeProfileId]);

	useEffect(
		() => () => {
			if (keySavedTimeoutRef.current !== null) {
				window.clearTimeout(keySavedTimeoutRef.current);
			}
		},
		[],
	);

	useEffect(() => {
		if (!activeProfileId) {
			setApiState((prev) => ({ ...prev, secretConfigured: null }));
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const configured = await invoke("ai_secret_status", {
					profile_id: activeProfileId,
				});
				if (!cancelled) {
					setApiState((prev) => ({ ...prev, secretConfigured: configured }));
				}
			} catch {
				if (!cancelled) {
					setApiState((prev) => ({ ...prev, secretConfigured: null }));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeProfileId]);

	const setApiKeyDraft = useCallback((value: string) => {
		setApiState((prev) => ({ ...prev, apiKeyDraft: value }));
	}, []);

	const handleSetApiKey = useCallback(async () => {
		if (!activeProfileId || !apiState.apiKeyDraft.trim()) return;
		const profileId = activeProfileId;
		const apiKey = apiState.apiKeyDraft;
		setApiState((prev) => ({ ...prev, error: "" }));
		try {
			await invoke("ai_secret_set", {
				profile_id: profileId,
				api_key: apiKey,
			});
			if (activeProfileIdRef.current !== profileId) return;
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
				if (activeProfileIdRef.current !== profileId) return;
				setApiState((prev) => ({ ...prev, keySaved: false }));
			}, 3000);
			keySavedTimeoutRef.current = timeout;
		} catch (error) {
			if (activeProfileIdRef.current !== profileId) return;
			setApiState((prev) => ({ ...prev, error: errMessage(error) }));
		}
	}, [activeProfileId, apiState.apiKeyDraft]);

	const handleClearApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		const profileId = activeProfileId;
		setApiState((prev) => ({ ...prev, error: "" }));
		try {
			await invoke("ai_secret_clear", { profile_id: profileId });
			if (activeProfileIdRef.current !== profileId) return;
			setApiState((prev) => ({
				...prev,
				apiKeyDraft: "",
				secretConfigured: false,
			}));
		} catch (error) {
			if (activeProfileIdRef.current !== profileId) return;
			setApiState((prev) => ({ ...prev, error: errMessage(error) }));
		}
	}, [activeProfileId]);

	return {
		apiState,
		setApiKeyDraft,
		handleSetApiKey,
		handleClearApiKey,
	};
}
