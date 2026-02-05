import { useCallback, useEffect, useMemo, useState } from "react";
import { type AiProfile, invoke } from "../../lib/tauri";
import { AiBehaviorSections } from "./ai/AiBehaviorSections";
import { AiProfileSections } from "./ai/AiProfileSections";
import { errMessage, headersToText, parseHeadersText } from "./ai/utils";

export function AiSettingsPane() {
	const [profiles, setProfiles] = useState<AiProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [profileDraft, setProfileDraft] = useState<AiProfile | null>(null);
	const [headersText, setHeadersText] = useState("");
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [secretConfigured, setSecretConfigured] = useState<boolean | null>(
		null,
	);
	const [error, setError] = useState("");
	const [temperature, setTemperature] = useState(0.4);
	const [topP, setTopP] = useState(0.9);
	const [maxTokens, setMaxTokens] = useState(2048);
	const [streamResponses, setStreamResponses] = useState(true);
	const [autoContext, setAutoContext] = useState(true);
	const [citeSources, setCiteSources] = useState(true);
	const [allowWeb, setAllowWeb] = useState(true);
	const [storeChats, setStoreChats] = useState(false);
	const [redactSecrets, setRedactSecrets] = useState(true);
	const [tone, setTone] = useState("balanced");
	const [autoTitle, setAutoTitle] = useState(true);
	const [toolPolicy, setToolPolicy] = useState("ask");

	const activeProfile = useMemo(() => {
		if (!activeProfileId) return null;
		return profiles.find((p) => p.id === activeProfileId) ?? null;
	}, [activeProfileId, profiles]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setError("");
			try {
				const [list, active] = await Promise.all([
					invoke("ai_profiles_list"),
					invoke("ai_active_profile_get"),
				]);
				if (cancelled) return;
				setProfiles(list);
				const id = active ?? list[0]?.id ?? null;
				setActiveProfileId(id);
				if (!active && list[0]?.id) {
					await invoke("ai_active_profile_set", { id: list[0].id });
				}
			} catch (e) {
				if (!cancelled) setError(errMessage(e));
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

	const createDefaultProfile = useCallback(async () => {
		setError("");
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
			setActiveProfileId(created.id);
			await invoke("ai_active_profile_set", { id: created.id });
		} catch (e) {
			setError(errMessage(e));
		}
	}, []);

	const saveProfile = useCallback(async () => {
		if (!profileDraft) return;
		setError("");
		try {
			const saved = await invoke("ai_profile_upsert", {
				profile: { ...profileDraft, headers: parseHeadersText(headersText) },
			});
			setProfiles((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
			setActiveProfileId(saved.id);
		} catch (e) {
			setError(errMessage(e));
		}
	}, [headersText, profileDraft]);

	const deleteProfile = useCallback(async () => {
		if (!activeProfileId) return;
		if (!window.confirm("Delete this AI profile?")) return;
		setError("");
		try {
			await invoke("ai_profile_delete", { id: activeProfileId });
			setProfiles((prev) => prev.filter((p) => p.id !== activeProfileId));
			setActiveProfileId(null);
			setProfileDraft(null);
		} catch (e) {
			setError(errMessage(e));
		}
	}, [activeProfileId]);

	const setApiKey = useCallback(async () => {
		if (!activeProfileId || !apiKeyDraft.trim()) return;
		setError("");
		try {
			await invoke("ai_secret_set", {
				profile_id: activeProfileId,
				api_key: apiKeyDraft,
			});
			setApiKeyDraft("");
			setSecretConfigured(true);
		} catch (e) {
			setError(errMessage(e));
		}
	}, [activeProfileId, apiKeyDraft]);

	const clearApiKey = useCallback(async () => {
		if (!activeProfileId) return;
		setError("");
		try {
			await invoke("ai_secret_clear", { profile_id: activeProfileId });
			setApiKeyDraft("");
			setSecretConfigured(false);
		} catch (e) {
			setError(errMessage(e));
		}
	}, [activeProfileId]);

	const onActiveProfileChange = useCallback(async (id: string | null) => {
		setActiveProfileId(id);
		await invoke("ai_active_profile_set", { id });
	}, []);

	const onProfileDraftChange = useCallback(
		(updater: (prev: AiProfile) => AiProfile) => {
			setProfileDraft((prev) => (prev ? updater(prev) : prev));
		},
		[],
	);

	return (
		<div className="settingsPane">
			<div className="settingsHero">
				<div>
					<h2>AI</h2>
					<p className="settingsHint">
						Manage providers, credentials, and generation defaults.
					</p>
				</div>
				<div className="settingsBadge">Local-first</div>
			</div>
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<AiProfileSections
					profiles={profiles}
					activeProfileId={activeProfileId}
					profileDraft={profileDraft}
					headersText={headersText}
					secretConfigured={secretConfigured}
					apiKeyDraft={apiKeyDraft}
					onActiveProfileChange={onActiveProfileChange}
					onCreateProfile={() => void createDefaultProfile()}
					onDeleteProfile={() => void deleteProfile()}
					onProfileDraftChange={onProfileDraftChange}
					onHeadersTextChange={setHeadersText}
					onSaveProfile={() => void saveProfile()}
					onApiKeyDraftChange={setApiKeyDraft}
					onSetApiKey={() => void setApiKey()}
					onClearApiKey={() => void clearApiKey()}
				/>
				<AiBehaviorSections
					temperature={temperature}
					onTemperatureChange={setTemperature}
					topP={topP}
					onTopPChange={setTopP}
					maxTokens={maxTokens}
					onMaxTokensChange={setMaxTokens}
					streamResponses={streamResponses}
					onToggleStreamResponses={() => setStreamResponses((prev) => !prev)}
					autoContext={autoContext}
					onToggleAutoContext={() => setAutoContext((prev) => !prev)}
					citeSources={citeSources}
					onToggleCiteSources={() => setCiteSources((prev) => !prev)}
					allowWeb={allowWeb}
					onToggleAllowWeb={() => setAllowWeb((prev) => !prev)}
					redactSecrets={redactSecrets}
					onToggleRedactSecrets={() => setRedactSecrets((prev) => !prev)}
					storeChats={storeChats}
					onToggleStoreChats={() => setStoreChats((prev) => !prev)}
					tone={tone}
					onToneChange={setTone}
					autoTitle={autoTitle}
					onToggleAutoTitle={() => setAutoTitle((prev) => !prev)}
					toolPolicy={toolPolicy}
					onToolPolicyChange={setToolPolicy}
				/>
			</div>
		</div>
	);
}
