import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
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
	const providerUsesApiKey = profileDraft?.provider !== "codex_chatgpt";
	const [codexState, setCodexState] = useState<{
		status: string;
		email: string | null;
		displayName: string | null;
		authMode: string | null;
		usedPercent: number | null;
		windowMinutes: number | null;
		error: string;
		loading: boolean;
	}>({
		status: "disconnected",
		email: null,
		displayName: null,
		authMode: null,
		usedPercent: null,
		windowMinutes: null,
		error: "",
		loading: false,
	});

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

	const refreshCodexAccount = useCallback(async () => {
		setCodexState((prev) => ({ ...prev, loading: true, error: "" }));
		try {
			const info = await invoke("codex_account_read");
			let usedPercent: number | null = null;
			let windowMinutes: number | null = null;
			try {
				const limits = await invoke("codex_rate_limits_read");
				usedPercent = Number.isFinite(limits.used_percent)
					? limits.used_percent
					: null;
				windowMinutes =
					typeof limits.window_minutes === "number"
						? limits.window_minutes
						: null;
			} catch {
				// Non-fatal for account status.
			}
			setCodexState({
				status: info.status,
				email: info.email ?? null,
				displayName: info.display_name ?? null,
				authMode: info.auth_mode ?? null,
				usedPercent,
				windowMinutes,
				error: "",
				loading: false,
			});
		} catch (e) {
			setCodexState((prev) => ({
				...prev,
				error: errMessage(e),
				loading: false,
			}));
		}
	}, []);

	useEffect(() => {
		if (profileDraft?.provider !== "codex_chatgpt") return;
		void refreshCodexAccount();
	}, [profileDraft?.provider, refreshCodexAccount]);

	const handleCodexConnect = useCallback(async () => {
		setCodexState((prev) => ({ ...prev, loading: true, error: "" }));
		try {
			const started = await invoke("codex_login_start");
			await openUrl(started.auth_url);
			try {
				await invoke("codex_login_complete", { flow_id: started.flow_id });
			} catch {
				// Completion may be async depending on provider callback timing.
			}
			await refreshCodexAccount();
		} catch (e) {
			setCodexState((prev) => ({
				...prev,
				error: errMessage(e),
				loading: false,
			}));
		}
	}, [refreshCodexAccount]);

	const handleCodexDisconnect = useCallback(async () => {
		setCodexState((prev) => ({ ...prev, loading: true, error: "" }));
		try {
			await invoke("codex_logout");
			await refreshCodexAccount();
		} catch (e) {
			setCodexState((prev) => ({
				...prev,
				error: errMessage(e),
				loading: false,
			}));
		}
	}, [refreshCodexAccount]);

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
							<option value="codex_chatgpt">Codex (ChatGPT OAuth)</option>
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

			{profileDraft?.provider === "codex_chatgpt" ? (
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">ChatGPT Account</div>
						</div>
						<div
							className={`settingsPill ${codexState.status === "connected" ? "settingsPillOk" : ""}`}
						>
							{codexState.status}
						</div>
					</div>
					<div className="settingsField">
						<div className="settingsLabel">Identity</div>
						<div className="settingsHint">
							{codexState.displayName || codexState.email || "Not connected"}
						</div>
					</div>
					{codexState.authMode ? (
						<div className="settingsField">
							<div className="settingsLabel">Auth Mode</div>
							<div className="settingsHint">{codexState.authMode}</div>
						</div>
					) : null}
					{codexState.usedPercent != null ? (
						<div className="settingsField">
							<div className="settingsLabel">Rate Limit Usage</div>
							<div className="settingsHint">
								{`${codexState.usedPercent.toFixed(1)}%`}
								{codexState.windowMinutes != null
									? ` of ${codexState.windowMinutes}-minute window`
									: ""}
							</div>
						</div>
					) : null}
					<div className="settingsInline">
						{codexState.status === "connected" ? (
							<button
								type="button"
								onClick={() => void handleCodexDisconnect()}
								disabled={codexState.loading}
							>
								Disconnect
							</button>
						) : (
							<button
								type="button"
								onClick={() => void handleCodexConnect()}
								disabled={codexState.loading}
							>
								Sign in with ChatGPT
							</button>
						)}
						<button
							type="button"
							onClick={() => void refreshCodexAccount()}
							disabled={codexState.loading}
						>
							Refresh
						</button>
					</div>
					{codexState.error ? (
						<div className="settingsError">{codexState.error}</div>
					) : null}
				</section>
			) : null}

			{profileDraft && providerUsesApiKey ? (
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
