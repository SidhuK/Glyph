import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { type AiModel, type AiProfile, invoke } from "../../../lib/tauri";
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

const CODEX_RATE_LIMIT_REFRESH_MS = 30 * 60 * 1000;
const CODEX_RESET_TIME_TICK_MS = 30 * 1000;

function formatRateLimitWindow(minutes: number | null): string {
	if (minutes == null || !Number.isFinite(minutes)) return "window";
	if (minutes === 10080) return "weekly window";
	if (minutes === 300) return "5-hour window";
	if (minutes >= 60 && minutes % 60 === 0) {
		const hours = minutes / 60;
		return `${hours}-hour window`;
	}
	return `${minutes}-minute window`;
}

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

function toneForRateLimitUsed(usedPercent: number): "ok" | "warn" | "danger" {
	const clamped = clampPercent(usedPercent);
	const remaining = 100 - clamped;
	if (remaining <= 20) return "danger";
	if (remaining <= 50) return "warn";
	return "ok";
}

function toneForCodexStatus(
	status: string,
): "settingsPillOk" | "settingsPillWarn" | "settingsPillInfo" {
	if (status === "connected") return "settingsPillOk";
	if (status === "disconnected") return "settingsPillWarn";
	return "settingsPillInfo";
}

function toneForSecretConfigured(
	secretConfigured: boolean | null,
): "settingsPillOk" | "settingsPillWarn" | "settingsPillError" {
	if (secretConfigured === true) return "settingsPillOk";
	if (secretConfigured === false) return "settingsPillError";
	return "settingsPillWarn";
}

function labelForCodexStatus(status: string): string {
	if (!status) return "Unknown";
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function toEpochMs(timestamp: number | null): number | null {
	if (timestamp == null || !Number.isFinite(timestamp) || timestamp <= 0) {
		return null;
	}
	return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatCountdown(targetEpochMs: number, nowMs: number): string {
	const diffMs = Math.max(0, targetEpochMs - nowMs);
	const totalMinutes = Math.ceil(diffMs / 60_000);
	if (totalMinutes <= 1) return "<1m";
	const days = Math.floor(totalMinutes / 1_440);
	const hours = Math.floor((totalMinutes % 1_440) / 60);
	const minutes = totalMinutes % 60;
	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
	return parts.slice(0, 2).join(" ");
}

function formatResetAt(timestamp: number | null): string | null {
	const epochMs = toEpochMs(timestamp);
	if (!epochMs) return null;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(epochMs));
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
	const [availableModels, setAvailableModels] = useState<AiModel[] | null>(
		null,
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
		rateLimits: Array<{
			key: string;
			label: string;
			usedPercent: number;
			windowMinutes: number | null;
			resetsAt: number | null;
		}>;
		error: string;
		loading: boolean;
	}>({
		status: "disconnected",
		email: null,
		displayName: null,
		authMode: null,
		rateLimits: [],
		error: "",
		loading: false,
	});
	const [nowMs, setNowMs] = useState(() => Date.now());

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
			let rateLimits: Array<{
				key: string;
				label: string;
				usedPercent: number;
				windowMinutes: number | null;
				resetsAt: number | null;
			}> = [];
			try {
				const limits = await invoke("codex_rate_limits_read");
				rateLimits = (limits.buckets ?? []).flatMap((bucket, bucketIndex) => {
					const bucketName =
						bucket.limit_name || bucket.limit_id || `limit-${bucketIndex + 1}`;
					const windows: Array<{
						key: string;
						label: string;
						usedPercent: number;
						windowMinutes: number | null;
						resetsAt: number | null;
					}> = [];
					const pushWindow = (
						kind: "primary" | "secondary",
						window:
							| {
									used_percent: number;
									window_duration_mins?: number | null;
									resets_at?: number | null;
							  }
							| null
							| undefined,
					) => {
						if (!window || !Number.isFinite(window.used_percent)) return;
						const windowMinutes =
							typeof window.window_duration_mins === "number"
								? window.window_duration_mins
								: null;
						const resetsAt =
							typeof window.resets_at === "number" ? window.resets_at : null;
						const humanWindow = formatRateLimitWindow(windowMinutes);
						windows.push({
							key: `${bucketName}:${kind}`,
							label: humanWindow,
							usedPercent: window.used_percent,
							windowMinutes,
							resetsAt,
						});
					};
					pushWindow("primary", bucket.primary);
					pushWindow("secondary", bucket.secondary);
					return windows;
				});
				const deduped = new Map<
					string,
					{
						key: string;
						label: string;
						usedPercent: number;
						windowMinutes: number | null;
						resetsAt: number | null;
					}
				>();
				for (const item of rateLimits) {
					const dedupeKey =
						typeof item.windowMinutes === "number"
							? `window:${item.windowMinutes}`
							: item.label.toLowerCase();
					const nextItem = {
						...item,
						usedPercent: clampPercent(item.usedPercent),
					};
					const existing = deduped.get(dedupeKey);
					if (!existing || nextItem.usedPercent > existing.usedPercent) {
						deduped.set(dedupeKey, nextItem);
					}
				}
				rateLimits = Array.from(deduped.values()).sort((a, b) => {
					const aMinutes = a.windowMinutes ?? Number.MAX_SAFE_INTEGER;
					const bMinutes = b.windowMinutes ?? Number.MAX_SAFE_INTEGER;
					return aMinutes - bMinutes;
				});
			} catch {
				// Non-fatal for account status.
			}
			setCodexState({
				status: info.status,
				email: info.email ?? null,
				displayName: info.display_name ?? null,
				authMode: info.auth_mode ?? null,
				rateLimits,
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

	useEffect(() => {
		if (profileDraft?.provider !== "codex_chatgpt") return;
		const timer = window.setInterval(() => {
			void refreshCodexAccount();
		}, CODEX_RATE_LIMIT_REFRESH_MS);
		return () => window.clearInterval(timer);
	}, [profileDraft?.provider, refreshCodexAccount]);

	useEffect(() => {
		if (profileDraft?.provider !== "codex_chatgpt") return;
		const timer = window.setInterval(() => {
			setNowMs(Date.now());
		}, CODEX_RESET_TIME_TICK_MS);
		return () => window.clearInterval(timer);
	}, [profileDraft?.provider]);

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

	const persistDraft = useCallback(
		async (nextDraft: AiProfile) => {
			setProfileDraft(nextDraft);
			await onSaveProfile(nextDraft);
		},
		[onSaveProfile],
	);

	const selectedModel =
		availableModels?.find((m) => m.id === profileDraft?.model) ?? null;
	const reasoningOptions = selectedModel?.reasoning_effort ?? null;
	const shouldShowReasoningSelect = profileDraft?.provider === "codex_chatgpt";

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
							<div className="settingsCardTitle">Active Profile</div>
							<div className="settingsCardHint">
								Switch between saved provider profiles.
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
								Create your first provider profile.
							</div>
						</div>
					</div>
					<div className="settingsRow">
						<button type="button" onClick={onCreateProfile}>
							Create Profile
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
								Choose service, model, and advanced options. Service and model
								changes save automatically.
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
							onChange={(e) => {
								const nextProvider = e.target.value as AiProfile["provider"];
								const nextDraft: AiProfile = {
									...profileDraft,
									provider: nextProvider,
									reasoning_effort:
										nextProvider === "codex_chatgpt"
											? (profileDraft.reasoning_effort ?? null)
											: null,
								};
								void persistDraft(nextDraft);
							}}
						>
							<option value="codex_chatgpt">Codex (ChatGPT OAuth)</option>
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
							onChange={(next) => {
								const model =
									availableModels?.find((entry) => entry.id === next) ?? null;
								const options = model?.reasoning_effort ?? null;
								const current = profileDraft.reasoning_effort ?? null;
								const stillValid = !!options?.some(
									(option) => option.effort === current,
								);
								const nextEffort = stillValid
									? current
									: (model?.default_reasoning_effort ?? current);
								const nextDraft: AiProfile = {
									...profileDraft,
									model: next,
									reasoning_effort:
										profileDraft.provider === "codex_chatgpt"
											? nextEffort
											: null,
								};
								void persistDraft(nextDraft);
							}}
							onModelsChange={setAvailableModels}
						/>
					</div>

					{shouldShowReasoningSelect ? (
						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiReasoningEffort">
									Reasoning level
								</label>
							</div>
							{(reasoningOptions?.length ?? 0) > 0 ? (
								<select
									id="aiReasoningEffort"
									value={
										profileDraft?.reasoning_effort ??
										selectedModel?.default_reasoning_effort ??
										reasoningOptions?.[0]?.effort ??
										""
									}
									onChange={(e) =>
										void persistDraft({
											...profileDraft,
											reasoning_effort: e.target.value || null,
										})
									}
								>
									{reasoningOptions?.map((option) => (
										<option key={option.effort} value={option.effort}>
											{option.description
												? `${option.effort} - ${option.description}`
												: option.effort}
										</option>
									))}
								</select>
							) : (
								<>
									<input
										id="aiReasoningEffort"
										value={profileDraft?.reasoning_effort ?? ""}
										placeholder="e.g. low, medium, high"
										onChange={(e) =>
											updateDraft((p) => ({
												...p,
												reasoning_effort: e.target.value || null,
											}))
										}
									/>
									<div className="settingsHint">
										This model did not publish reasoning options; enter effort
										manually.
									</div>
								</>
							)}
						</div>
					) : null}

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
							Save Profile
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
							<div className="settingsCardHint">
								Check connection status and usage limits.
							</div>
						</div>
						<div
							className={`settingsPill ${toneForCodexStatus(codexState.status)}`}
						>
							{labelForCodexStatus(codexState.status)}
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
							<div className="settingsLabel">Authentication</div>
							<div className="settingsHint">{codexState.authMode}</div>
						</div>
					) : null}
					{codexState.rateLimits.length > 0 ? (
						<div className="settingsField">
							<div className="settingsLabel">Rate Limits</div>
							<div className="codexRateLimitList">
								{codexState.rateLimits.map((item) => (
									<div key={item.key} className="codexRateLimitItem">
										<div className="codexRateLimitRow">
											<span>{item.label}</span>
											<span>{`${(100 - item.usedPercent).toFixed(1)}% remaining`}</span>
										</div>
										<div
											className="codexRateLimitBar"
											role="progressbar"
											tabIndex={0}
											aria-label={`${item.label} remaining`}
											aria-valuemin={0}
											aria-valuemax={100}
											aria-valuenow={Math.round(100 - item.usedPercent)}
										>
											<div
												className={`codexRateLimitBarFill codexRateLimitBarFill--${toneForRateLimitUsed(item.usedPercent)}`}
												style={{
													width: `${clampPercent(100 - item.usedPercent)}%`,
												}}
											/>
										</div>
										<div className="codexRateLimitMeta">
											<div>{`${item.usedPercent.toFixed(1)}% used`}</div>
											{item.resetsAt != null ? (
												<div>
													{(() => {
														const resetEpochMs = toEpochMs(item.resetsAt);
														if (!resetEpochMs) return "Reset time unavailable";
														const resetAtLabel = formatResetAt(item.resetsAt);
														if (resetEpochMs <= nowMs) {
															return resetAtLabel
																? `Reset reached at ${resetAtLabel}`
																: "Reset reached";
														}
														const countdown = formatCountdown(
															resetEpochMs,
															nowMs,
														);
														return resetAtLabel
															? `Resets in ${countdown} (${resetAtLabel})`
															: `Resets in ${countdown}`;
													})()}
												</div>
											) : (
												<div>Reset time unavailable</div>
											)}
										</div>
									</div>
								))}
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
								Sign In with ChatGPT
							</button>
						)}
						<button
							type="button"
							onClick={() => void refreshCodexAccount()}
							disabled={codexState.loading}
						>
							Refresh Status
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
							<div className="settingsCardHint">
								Stored locally in the secure secret store.
							</div>
						</div>
						<div
							className={`settingsPill ${toneForSecretConfigured(secretConfigured)}`}
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
								placeholder="Paste key..."
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
