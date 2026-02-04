import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type AiHeader,
	type AiProfile,
	TauriInvokeError,
	invoke,
} from "../../lib/tauri";

function errMessage(err: unknown): string {
	if (err instanceof TauriInvokeError) return err.message;
	if (err instanceof Error) return err.message;
	return String(err);
}

function headersToText(headers: AiHeader[]): string {
	return headers
		.map((h) => `${h.key}: ${h.value}`)
		.join("\n")
		.trim();
}

function parseHeadersText(text: string): AiHeader[] {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	const out: AiHeader[] = [];
	for (const line of lines) {
		const idx = line.indexOf(":");
		if (idx <= 0) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (!key) continue;
		out.push({ key, value });
	}
	return out;
}

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
			const nextProfile: AiProfile = {
				...profileDraft,
				headers: parseHeadersText(headersText),
			};
			const saved = await invoke("ai_profile_upsert", {
				profile: nextProfile,
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
		if (!activeProfileId) return;
		if (!apiKeyDraft.trim()) return;
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
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Profiles</div>
							<div className="settingsCardHint">Manage providers.</div>
						</div>
						<div className="settingsPill">Profiles</div>
					</div>

					{profiles.length ? (
						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiProfileSel">
									Active profile
								</label>
								<div className="settingsHelp">Used for AI requests.</div>
							</div>
							<div className="settingsInline">
								<select
									id="aiProfileSel"
									value={activeProfileId ?? ""}
									onChange={async (e) => {
										const id = e.target.value || null;
										setActiveProfileId(id);
										await invoke("ai_active_profile_set", { id });
									}}
								>
									{profiles.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name}
										</option>
									))}
								</select>
								<button type="button" onClick={deleteProfile}>
									Delete
								</button>
							</div>
						</div>
					) : (
						<div className="settingsRow">
							<button type="button" onClick={createDefaultProfile}>
								Create profile
							</button>
						</div>
					)}
				</section>

				{profileDraft ? (
					<section className="settingsCard settingsSpan">
						<div className="settingsCardHeader">
							<div>
								<div className="settingsCardTitle">Profile Details</div>
								<div className="settingsCardHint">Provider settings.</div>
							</div>
							<div className="settingsPill">Profile</div>
						</div>

						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiName">
									Name
								</label>
								<div className="settingsHelp">Label for this profile.</div>
							</div>
							<input
								id="aiName"
								value={profileDraft.name}
								onChange={(e) =>
									setProfileDraft((p) =>
										p ? { ...p, name: e.target.value } : p,
									)
								}
							/>
						</div>

						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiProvider">
									Provider
								</label>
								<div className="settingsHelp">Pick the API provider.</div>
							</div>
							<select
								id="aiProvider"
								value={profileDraft.provider}
								onChange={(e) =>
									setProfileDraft((p) =>
										p
											? {
													...p,
													provider: e.target.value as AiProfile["provider"],
												}
											: p,
									)
								}
							>
								<option value="openai">OpenAI</option>
								<option value="openai_compat">OpenAI-compatible</option>
								<option value="openrouter">OpenRouter</option>
								<option value="anthropic">Anthropic</option>
								<option value="gemini">Gemini</option>
								<option value="ollama">Ollama</option>
							</select>
						</div>

						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiAllowPrivate">
									Network
								</label>
								<div className="settingsHelp">
									Permit localhost and private hosts.
								</div>
							</div>
							<label className="settingsToggle">
								<input
									id="aiAllowPrivate"
									type="checkbox"
									checked={profileDraft.allow_private_hosts}
									onChange={() =>
										setProfileDraft((p) =>
											p
												? {
														...p,
														allow_private_hosts: !p.allow_private_hosts,
													}
												: p,
										)
									}
								/>
								<span />
							</label>
						</div>

						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiModel">
									Model
								</label>
								<div className="settingsHelp">Model identifier.</div>
							</div>
							<input
								id="aiModel"
								value={profileDraft.model}
								onChange={(e) =>
									setProfileDraft((p) =>
										p ? { ...p, model: e.target.value } : p,
									)
								}
							/>
						</div>

						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiBaseUrl">
									Base URL
								</label>
								<div className="settingsHelp">Override endpoint.</div>
							</div>
							<input
								id="aiBaseUrl"
								placeholder="(optional override)"
								value={profileDraft.base_url ?? ""}
								onChange={(e) =>
									setProfileDraft((p) =>
										p ? { ...p, base_url: e.target.value || null } : p,
									)
								}
							/>
						</div>

						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="aiHeaders">
									Headers
								</label>
								<div className="settingsHelp">One per line.</div>
							</div>
							<textarea
								id="aiHeaders"
								className="mono settingsTextarea"
								placeholder={"Header-Name: value\nX-Other: value"}
								value={headersText}
								onChange={(e) => setHeadersText(e.target.value)}
							/>
						</div>

						<div className="settingsRow">
							<button type="button" onClick={saveProfile}>
								Save profile
							</button>
						</div>
					</section>
				) : null}

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">API Key</div>
							<div className="settingsCardHint">Stored locally.</div>
						</div>
						<div className="settingsPill">Secret</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Status</div>
							<div className="settingsHelp">
								{secretConfigured == null
									? "Unknown"
									: secretConfigured
										? "Configured"
										: "Not set"}
							</div>
						</div>
						<div className="settingsValue">
							{secretConfigured == null
								? "(unknown)"
								: secretConfigured
									? "Configured"
									: "Not set"}
						</div>
					</div>

					<div className="settingsField">
						<div>
							<label className="settingsLabel" htmlFor="aiApiKeyInput">
								Set key
							</label>
							<div className="settingsHelp">Paste to update.</div>
						</div>
						<div className="settingsInline">
							<input
								id="aiApiKeyInput"
								placeholder="paste key…"
								value={apiKeyDraft}
								onChange={(e) => setApiKeyDraft(e.target.value)}
							/>
							<button type="button" onClick={setApiKey}>
								Set
							</button>
							<button type="button" onClick={clearApiKey}>
								Clear
							</button>
						</div>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Defaults</div>
							<div className="settingsCardHint">Generation settings.</div>
						</div>
						<div className="settingsPill">Tune</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Temperature</div>
							<div className="settingsHelp">Creativity level.</div>
						</div>
						<div className="settingsRange">
							<input
								type="range"
								min={0}
								max={1}
								step={0.05}
								value={temperature}
								onChange={(e) => setTemperature(Number(e.target.value))}
							/>
							<span className="settingsRangeValue">
								{temperature.toFixed(2)}
							</span>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Top P</div>
							<div className="settingsHelp">Sampling nucleus.</div>
						</div>
						<div className="settingsRange">
							<input
								type="range"
								min={0.2}
								max={1}
								step={0.05}
								value={topP}
								onChange={(e) => setTopP(Number(e.target.value))}
							/>
							<span className="settingsRangeValue">{topP.toFixed(2)}</span>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Max tokens</div>
							<div className="settingsHelp">Upper response length.</div>
						</div>
						<select
							value={maxTokens}
							onChange={(e) => setMaxTokens(Number(e.target.value))}
						>
							<option value={512}>512</option>
							<option value={1024}>1024</option>
							<option value={2048}>2048</option>
							<option value={4096}>4096</option>
						</select>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Streaming</div>
							<div className="settingsHelp">Show responses live.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={streamResponses}
								onChange={() => setStreamResponses((prev) => !prev)}
							/>
							<span />
						</label>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Context</div>
							<div className="settingsCardHint">What the model sees.</div>
						</div>
						<div className="settingsPill">Context</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Auto context</div>
							<div className="settingsHelp">Include related notes.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={autoContext}
								onChange={() => setAutoContext((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Citations</div>
							<div className="settingsHelp">Show source badges.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={citeSources}
								onChange={() => setCiteSources((prev) => !prev)}
							/>
							<span />
						</label>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Privacy</div>
							<div className="settingsCardHint">Control data sharing.</div>
						</div>
						<div className="settingsPill">Privacy</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Allow web tools</div>
							<div className="settingsHelp">Enable tool access.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={allowWeb}
								onChange={() => setAllowWeb((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Redact secrets</div>
							<div className="settingsHelp">Mask API keys.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={redactSecrets}
								onChange={() => setRedactSecrets((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Store chats</div>
							<div className="settingsHelp">Keep AI history.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={storeChats}
								onChange={() => setStoreChats((prev) => !prev)}
							/>
							<span />
						</label>
					</div>
				</section>

				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">UX</div>
							<div className="settingsCardHint">Response style.</div>
						</div>
						<div className="settingsPill">UX</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Tone</div>
							<div className="settingsHelp">Communication style.</div>
						</div>
						<select value={tone} onChange={(e) => setTone(e.target.value)}>
							<option value="balanced">Balanced</option>
							<option value="precise">Precise</option>
							<option value="friendly">Friendly</option>
						</select>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Auto titles</div>
							<div className="settingsHelp">Title AI outputs.</div>
						</div>
						<label className="settingsToggle">
							<input
								type="checkbox"
								checked={autoTitle}
								onChange={() => setAutoTitle((prev) => !prev)}
							/>
							<span />
						</label>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Tool policy</div>
							<div className="settingsHelp">When tools can run.</div>
						</div>
						<select
							value={toolPolicy}
							onChange={(e) => setToolPolicy(e.target.value)}
						>
							<option value="ask">Ask first</option>
							<option value="auto">Auto</option>
							<option value="never">Never</option>
						</select>
					</div>
				</section>
			</div>
		</div>
	);
}
