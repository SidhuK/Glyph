import { useCallback, useEffect, useState } from "react";
import { type AiProfile, invoke } from "../../../lib/tauri";
import { AiModelCombobox } from "./AiModelCombobox";
import { errMessage } from "./utils";

interface AiProfileSectionsProps {
	profiles: AiProfile[];
	activeProfileId: string | null;
	activeProfile: AiProfile | null;
	onActiveProfileChange: (id: string | null) => Promise<void>;
	onCreateProfile: () => void;
	onSaveProfile: (draft: AiProfile) => Promise<void>;
}

export function AiProfileSections({
	profiles,
	activeProfileId,
	activeProfile,
	onActiveProfileChange,
	onCreateProfile,
	onSaveProfile,
}: AiProfileSectionsProps) {
	const [profileDraft, setProfileDraft] = useState<AiProfile | null>(
		activeProfile ? structuredClone(activeProfile) : null,
	);
	const [apiState, setApiState] = useState<{
		apiKeyDraft: string;
		secretConfigured: boolean | null;
		keySaved: boolean;
		error: string;
		keySavedTimeout: number | null;
	}>({
		apiKeyDraft: "",
		secretConfigured: null,
		keySaved: false,
		error: "",
		keySavedTimeout: null,
	});
	const { apiKeyDraft, secretConfigured, keySaved, error, keySavedTimeout } =
		apiState;

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

	const updateDraft = useCallback((updater: (prev: AiProfile) => AiProfile) => {
		setProfileDraft((prev) => (prev ? updater(prev) : prev));
	}, []);

	const handleSave = useCallback(async () => {
		if (!profileDraft) return;
		await onSaveProfile(profileDraft);
	}, [profileDraft, onSaveProfile]);

	const handleSetApiKey = useCallback(async () => {
		if (!activeProfileId || !apiKeyDraft.trim()) return;
		setApiState((prev) => ({ ...prev, error: "" }));
		try {
			await invoke("ai_secret_set", {
				profile_id: activeProfileId,
				api_key: apiKeyDraft,
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
			setApiState((prev) => ({ ...prev, keySavedTimeout: timeout }));
		} catch (e) {
			setApiState((prev) => ({ ...prev, error: errMessage(e) }));
		}
	}, [activeProfileId, apiKeyDraft, keySavedTimeout]);

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
		} catch (e) {
			setApiState((prev) => ({ ...prev, error: errMessage(e) }));
		}
	}, [activeProfileId]);

	return (
		<>
			{profiles.length > 1 ? (
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Profile</div>
						</div>
					</div>
					<div className="settingsField">
						<div>
							<label className="settingsLabel" htmlFor="aiProfileSel">
								Active profile
							</label>
						</div>
						<select
							id="aiProfileSel"
							value={activeProfileId ?? ""}
							onChange={(e) =>
								void onActiveProfileChange(e.target.value || null)
							}
						>
							{profiles.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					</div>
				</section>
			) : profiles.length === 0 ? (
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Get Started</div>
						</div>
					</div>
					<div className="settingsRow">
						<button type="button" onClick={onCreateProfile}>
							Create profile
						</button>
					</div>
				</section>
			) : null}

			{profileDraft ? (
				<section className="settingsCard settingsSpan">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Provider</div>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<label className="settingsLabel" htmlFor="aiProvider">
								Service
							</label>
						</div>
						<select
							id="aiProvider"
							value={profileDraft.provider}
							onChange={(e) =>
								updateDraft((p) => ({
									...p,
									provider: e.target.value as AiProfile["provider"],
								}))
							}
						>
							<option value="openai">OpenAI</option>
							<option value="openrouter">OpenRouter</option>
							<option value="anthropic">Anthropic</option>
							<option value="gemini">Gemini</option>
							<option value="ollama">Ollama</option>
							<option value="openai_compat">OpenAI-compatible</option>
						</select>
					</div>

					<div className="settingsField">
						<div>
							<label className="settingsLabel" htmlFor="aiModel">
								Model
							</label>
						</div>
						<AiModelCombobox
							key={`${profileDraft.id}:${profileDraft.provider}`}
							profileId={profileDraft.id}
							provider={profileDraft.provider}
							value={profileDraft.model}
							secretConfigured={secretConfigured}
							onChange={(next) => updateDraft((p) => ({ ...p, model: next }))}
						/>
					</div>

					{profileDraft.provider === "openai_compat" ? (
						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiBaseUrl">
									Base URL
								</label>
							</div>
							<input
								id="aiBaseUrl"
								placeholder="https://api.example.com/v1"
								value={profileDraft.base_url ?? ""}
								onChange={(e) =>
									updateDraft((p) => ({
										...p,
										base_url: e.target.value || null,
									}))
								}
							/>
						</div>
					) : null}

					<div className="settingsRow">
						<button type="button" onClick={() => void handleSave()}>
							Save
						</button>
					</div>
				</section>
			) : null}

			{error ? <div className="settingsError">{error}</div> : null}

			{profileDraft ? (
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">API Key</div>
						</div>
						<div
							className={`settingsPill ${secretConfigured ? "settingsPillOk" : ""}`}
						>
							{secretConfigured == null
								? "Unknown"
								: secretConfigured
									? "Active"
									: "Missing"}
						</div>
					</div>

					<div className="settingsField">
						<div>
							<label className="settingsLabel" htmlFor="aiApiKeyInput">
								{secretConfigured ? "Update key" : "Set key"}
							</label>
						</div>
						<div className="settingsInline">
							<input
								id="aiApiKeyInput"
								type="password"
								placeholder="paste key…"
								value={apiKeyDraft}
								onChange={(e) =>
									setApiState((prev) => ({
										...prev,
										apiKeyDraft: e.target.value,
									}))
								}
							/>
							<button type="button" onClick={() => void handleSetApiKey()}>
								Save
							</button>
							{secretConfigured ? (
								<button type="button" onClick={() => void handleClearApiKey()}>
									Clear
								</button>
							) : null}
						</div>
					</div>

					{keySaved ? (
						<div className="settingsKeySaved">API key saved</div>
					) : null}
				</section>
			) : null}
		</>
	);
}
