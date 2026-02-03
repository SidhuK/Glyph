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
			<h2>AI</h2>
			{error ? <div className="settingsError">{error}</div> : null}

			{profiles.length ? (
				<div className="settingsRow">
					<label className="settingsLabel" htmlFor="aiProfileSel">
						Profile
					</label>
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
			) : (
				<div className="settingsRow">
					<button type="button" onClick={createDefaultProfile}>
						Create profile
					</button>
				</div>
			)}

			{profileDraft ? (
				<div className="settingsSection">
					<div className="settingsSectionTitle">Profile</div>

					<div className="settingsRow">
						<label className="settingsLabel" htmlFor="aiName">
							Name
						</label>
						<input
							id="aiName"
							value={profileDraft.name}
							onChange={(e) =>
								setProfileDraft((p) => (p ? { ...p, name: e.target.value } : p))
							}
						/>
					</div>

					<div className="settingsRow">
						<label className="settingsLabel" htmlFor="aiProvider">
							Provider
						</label>
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

					<div className="settingsRow">
						<label className="settingsLabel" htmlFor="aiAllowPrivate">
							Network
						</label>
						<label className="settingsInlineToggle">
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
							Allow localhost/private
						</label>
					</div>

					<div className="settingsRow">
						<label className="settingsLabel" htmlFor="aiModel">
							Model
						</label>
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

					<div className="settingsRow">
						<label className="settingsLabel" htmlFor="aiBaseUrl">
							Base URL
						</label>
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

					<div className="settingsRow">
						<label className="settingsLabel" htmlFor="aiHeaders">
							Headers
						</label>
						<textarea
							id="aiHeaders"
							className="mono"
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
				</div>
			) : null}

			<div className="settingsSection">
				<div className="settingsSectionTitle">API Key</div>

				<div className="settingsRow">
					<div className="settingsLabel">Status</div>
					<div className="settingsValue">
						{secretConfigured == null
							? "(unknown)"
							: secretConfigured
								? "Configured"
								: "Not set"}
					</div>
				</div>

				<div className="settingsRow">
					<label className="settingsLabel" htmlFor="aiApiKeyInput">
						Set key
					</label>
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
		</div>
	);
}
