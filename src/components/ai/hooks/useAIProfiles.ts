import { useCallback, useEffect, useState } from "react";
import { type AiProfile, invoke } from "../../../lib/tauri";
import { errMessage, headersToText, parseHeadersText } from "../utils";

export interface UseAIProfilesResult {
	profiles: AiProfile[];
	activeProfileId: string | null;
	activeProfile: AiProfile | null;
	profileDraft: AiProfile | null;
	setProfileDraft: React.Dispatch<React.SetStateAction<AiProfile | null>>;
	apiKeyDraft: string;
	setApiKeyDraft: React.Dispatch<React.SetStateAction<string>>;
	headersText: string;
	setHeadersText: React.Dispatch<React.SetStateAction<string>>;
	secretConfigured: boolean | null;
	settingsError: string;
	setActiveProfileId: (id: string | null) => Promise<void>;
	createDefaultProfile: () => Promise<void>;
	saveProfile: () => Promise<void>;
	deleteProfile: () => Promise<void>;
	setApiKey: () => Promise<void>;
	clearApiKey: () => Promise<void>;
}

export function useAIProfiles(): UseAIProfilesResult {
	const [profiles, setProfiles] = useState<AiProfile[]>([]);
	const [activeProfileId, setActiveProfileIdState] = useState<string | null>(
		null,
	);
	const [profileDraft, setProfileDraft] = useState<AiProfile | null>(null);
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [settingsError, setSettingsError] = useState("");
	const [secretConfigured, setSecretConfigured] = useState<boolean | null>(
		null,
	);
	const [headersText, setHeadersText] = useState("");

	const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [list, active] = await Promise.all([
					invoke("ai_profiles_list"),
					invoke("ai_active_profile_get"),
				]);
				if (cancelled) return;
				setProfiles(list);
				setActiveProfileIdState(active ?? list[0]?.id ?? null);
				if (!active && list[0]?.id) {
					await invoke("ai_active_profile_set", { id: list[0].id });
				}
			} catch (e) {
				if (!cancelled) setSettingsError(errMessage(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		setProfileDraft(activeProfile ? structuredClone(activeProfile) : null);
		setHeadersText(activeProfile ? headersToText(activeProfile.headers) : "");
	}, [activeProfile]);

	useEffect(() => {
		if (!activeProfileId) {
			setSecretConfigured(null);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const configured = await invoke("ai_secret_status", {
					profile_id: activeProfileId,
				});
				if (!cancelled) setSecretConfigured(configured);
			} catch {
				if (!cancelled) setSecretConfigured(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeProfileId]);

	const setActiveProfileId = useCallback(async (id: string | null) => {
		setActiveProfileIdState(id);
		await invoke("ai_active_profile_set", { id });
	}, []);

	const createDefaultProfile = useCallback(async () => {
		setSettingsError("");
		try {
			const created = await invoke("ai_profile_upsert", {
				profile: {
					id: "",
					name: "AI Profile",
					provider: "openai",
					model: "gpt-4o-mini",
					base_url: null,
					headers: [],
					allow_private_hosts: false,
				},
			});
			setProfiles((prev) => [...prev, created]);
			setActiveProfileIdState(created.id);
			await invoke("ai_active_profile_set", { id: created.id });
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, []);

	const saveProfile = useCallback(async () => {
		if (!profileDraft) return;
		setSettingsError("");
		try {
			const nextProfile: AiProfile = {
				...profileDraft,
				headers: parseHeadersText(headersText),
			};
			const saved = await invoke("ai_profile_upsert", {
				profile: nextProfile,
			});
			setProfiles((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
			setActiveProfileIdState(saved.id);
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [headersText, profileDraft]);

	const deleteProfile = useCallback(async () => {
		if (!activeProfileId) return;
		if (!window.confirm("Delete this AI profile?")) return;
		setSettingsError("");
		try {
			await invoke("ai_profile_delete", { id: activeProfileId });
			setProfiles((prev) => prev.filter((p) => p.id !== activeProfileId));
			setActiveProfileIdState(null);
			setProfileDraft(null);
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [activeProfileId]);

	const setApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		if (!apiKeyDraft.trim()) return;
		setSettingsError("");
		try {
			await invoke("ai_secret_set", {
				profile_id: activeProfileId,
				api_key: apiKeyDraft,
			});
			setApiKeyDraft("");
			setSecretConfigured(true);
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [activeProfileId, apiKeyDraft]);

	const clearApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		setSettingsError("");
		try {
			await invoke("ai_secret_clear", { profile_id: activeProfileId });
			setApiKeyDraft("");
			setSecretConfigured(false);
		} catch (e) {
			setSettingsError(errMessage(e));
		}
	}, [activeProfileId]);

	return {
		profiles,
		activeProfileId,
		activeProfile,
		profileDraft,
		setProfileDraft,
		apiKeyDraft,
		setApiKeyDraft,
		headersText,
		setHeadersText,
		secretConfigured,
		settingsError,
		setActiveProfileId,
		createDefaultProfile,
		saveProfile,
		deleteProfile,
		setApiKey,
		clearApiKey,
	};
}
