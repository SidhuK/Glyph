import { useCallback, useEffect, useState } from "react";
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
	const [keySavedTimeout, setKeySavedTimeout] = useState<number | null>(null);

	useEffect(
		() => () => {
			if (keySavedTimeout !== null) {
				window.clearTimeout(keySavedTimeout);
			}
		},
		[keySavedTimeout],
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
		setApiState((prev) => ({ ...prev, error: "" }));
		try {
			await invoke("ai_secret_set", {
				profile_id: activeProfileId,
				api_key: apiState.apiKeyDraft,
			});
			setApiState((prev) => ({
				...prev,
				apiKeyDraft: "",
				secretConfigured: true,
				keySaved: true,
			}));
			if (keySavedTimeout !== null) {
				window.clearTimeout(keySavedTimeout);
			}
			const timeout = window.setTimeout(() => {
				setApiState((prev) => ({ ...prev, keySaved: false }));
			}, 3000);
			setKeySavedTimeout(timeout);
		} catch (error) {
			setApiState((prev) => ({ ...prev, error: errMessage(error) }));
		}
	}, [activeProfileId, apiState.apiKeyDraft, keySavedTimeout]);

	const handleClearApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		setApiState((prev) => ({ ...prev, error: "" }));
		try {
			await invoke("ai_secret_clear", { profile_id: activeProfileId });
			setApiState((prev) => ({
				...prev,
				apiKeyDraft: "",
				secretConfigured: false,
			}));
		} catch (error) {
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
