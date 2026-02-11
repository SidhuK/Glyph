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
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [secretConfigured, setSecretConfigured] = useState<boolean | null>(
		null,
	);
	const [keySaved, setKeySaved] = useState(false);
	const [error, setError] = useState("");

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

	const updateDraft = useCallback((updater: (prev: AiProfile) => AiProfile) => {
		setProfileDraft((prev) => (prev ? updater(prev) : prev));
	}, []);

	const handleSave = useCallback(async () => {
		if (!profileDraft) return;
		await onSaveProfile(profileDraft);
	}, [profileDraft, onSaveProfile]);

	const handleSetApiKey = useCallback(async () => {
		if (!activeProfileId || !apiKeyDraft.trim()) return;
		setError("");
		try {
			await invoke("ai_secret_set", {
				profile_id: activeProfileId,
				api_key: apiKeyDraft,
			});
			setApiKeyDraft("");
			setSecretConfigured(true);
			setKeySaved(true);
			setTimeout(() => setKeySaved(false), 3000);
		} catch (e) {
			setError(errMessage(e));
		}
	}, [activeProfileId, apiKeyDraft]);

	const handleClearApiKey = useCallback(async () => {
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

	return (
		<>
			{profiles.length > 1 ? (
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Profile</div>
							<div className="settingsCardHint">
								Switch between provider configurations.
							</div>
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
							<div className="settingsCardHint">
								Create a profile to connect an AI provider.
							</div>
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
							<div className="settingsCardHint">
								Choose your AI service and model.
							</div>
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
								<div className="settingsHelp">
									API endpoint for your provider.
								</div>
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
							<div className="settingsCardHint">
								Stored locally in your vault.
							</div>
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
								onChange={(e) => setApiKeyDraft(e.target.value)}
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
