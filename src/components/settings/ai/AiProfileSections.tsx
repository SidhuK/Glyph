import type { AiProfile } from "../../../lib/tauri";
import { AiModelCombobox } from "./AiModelCombobox";

interface AiProfileSectionsProps {
	profiles: AiProfile[];
	activeProfileId: string | null;
	profileDraft: AiProfile | null;
	headersText: string;
	secretConfigured: boolean | null;
	apiKeyDraft: string;
	keySaved: boolean;
	onActiveProfileChange: (id: string | null) => Promise<void>;
	onCreateProfile: () => void;
	onProfileDraftChange: (updater: (prev: AiProfile) => AiProfile) => void;
	onHeadersTextChange: (text: string) => void;
	onSaveProfile: () => void;
	onApiKeyDraftChange: (value: string) => void;
	onSetApiKey: () => void;
	onClearApiKey: () => void;
}

export function AiProfileSections({
	profiles,
	activeProfileId,
	profileDraft,
	headersText,
	secretConfigured,
	apiKeyDraft,
	keySaved,
	onActiveProfileChange,
	onCreateProfile,
	onProfileDraftChange,
	onHeadersTextChange,
	onSaveProfile,
	onApiKeyDraftChange,
	onSetApiKey,
	onClearApiKey,
}: AiProfileSectionsProps) {
	return (
		<>
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
				) : (
					<div className="settingsRow">
						<button type="button" onClick={onCreateProfile}>
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
								onProfileDraftChange((p) => ({ ...p, name: e.target.value }))
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
								onProfileDraftChange((p) => ({
									...p,
									provider: e.target.value as AiProfile["provider"],
								}))
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
									onProfileDraftChange((p) => ({
										...p,
										allow_private_hosts: !p.allow_private_hosts,
									}))
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
							<div className="settingsHelp">Select a model.</div>
						</div>
						<AiModelCombobox
							profileId={profileDraft.id}
							value={profileDraft.model}
							secretConfigured={secretConfigured}
							onChange={(next) =>
								onProfileDraftChange((p) => ({ ...p, model: next }))
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
								onProfileDraftChange((p) => ({
									...p,
									base_url: e.target.value || null,
								}))
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
							onChange={(e) => onHeadersTextChange(e.target.value)}
						/>
					</div>

					<div className="settingsRow">
						<button type="button" onClick={onSaveProfile}>
							Save profile
						</button>
					</div>
				</section>
			) : null}

			<section className="settingsCard">
				<div className="settingsCardHeader">
					<div>
						<div className="settingsCardTitle">API Key</div>
						<div className="settingsCardHint">
							Stored in <code>.lattice/Lattice/ai_secrets.json</code>.
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
						<div className="settingsHelp">
							{secretConfigured
								? "Key is configured in the current vault. Paste to replace."
								: "Paste your API key to store it in the current vault."}
						</div>
					</div>
					<div className="settingsInline">
						<input
							id="aiApiKeyInput"
							type="password"
							placeholder="paste key…"
							value={apiKeyDraft}
							onChange={(e) => onApiKeyDraftChange(e.target.value)}
						/>
						<button type="button" onClick={onSetApiKey}>
							Save
						</button>
						{secretConfigured ? (
							<button type="button" onClick={onClearApiKey}>
								Clear
							</button>
						) : null}
					</div>
				</div>

				{keySaved ? (
					<div className="settingsKeySaved">API key saved successfully</div>
				) : null}
			</section>
		</>
	);
}
