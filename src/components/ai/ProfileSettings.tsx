import type { AiProfile } from "../../lib/tauri";

interface ProfileSettingsProps {
	profileDraft: AiProfile;
	setProfileDraft: React.Dispatch<React.SetStateAction<AiProfile | null>>;
	headersText: string;
	setHeadersText: React.Dispatch<React.SetStateAction<string>>;
	apiKeyDraft: string;
	setApiKeyDraft: React.Dispatch<React.SetStateAction<string>>;
	secretConfigured: boolean | null;
	saveProfile: () => Promise<void>;
	setApiKey: () => Promise<void>;
	clearApiKey: () => Promise<void>;
}

export function ProfileSettings({
	profileDraft,
	setProfileDraft,
	headersText,
	setHeadersText,
	apiKeyDraft,
	setApiKeyDraft,
	secretConfigured,
	saveProfile,
	setApiKey,
	clearApiKey,
}: ProfileSettingsProps) {
	return (
		<div className="aiSettings">
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiName">
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
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiProvider">
					Provider
				</label>
				<select
					id="aiProvider"
					value={profileDraft.provider}
					onChange={(e) =>
						setProfileDraft((p) =>
							p
								? { ...p, provider: e.target.value as AiProfile["provider"] }
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
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiAllowPrivate">
					Network
				</label>
				<label className="aiToggle">
					<input
						id="aiAllowPrivate"
						type="checkbox"
						checked={profileDraft.allow_private_hosts}
						onChange={() =>
							setProfileDraft((p) =>
								p ? { ...p, allow_private_hosts: !p.allow_private_hosts } : p,
							)
						}
					/>
					Allow localhost/private
				</label>
			</div>
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiModel">
					Model
				</label>
				<input
					id="aiModel"
					value={profileDraft.model}
					onChange={(e) =>
						setProfileDraft((p) => (p ? { ...p, model: e.target.value } : p))
					}
				/>
			</div>
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiBaseUrl">
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
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiHeaders">
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
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiApiKey">
					API key
				</label>
				<div className="aiMeta">
					{secretConfigured == null
						? ""
						: secretConfigured
							? "Configured"
							: "Not set"}
				</div>
			</div>
			<div className="aiRow">
				<label className="aiLabel" htmlFor="aiApiKeyInput">
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
			<div className="aiRow">
				<button type="button" onClick={saveProfile}>
					Save profile
				</button>
			</div>
		</div>
	);
}
