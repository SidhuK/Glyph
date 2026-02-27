import { toneForSecretConfigured } from "./aiProfileSectionUtils";

interface AiApiKeySectionProps {
	apiKeyDraft: string;
	secretConfigured: boolean | null;
	keySaved: boolean;
	onApiKeyDraftChange: (value: string) => void;
	onSaveKey: () => Promise<void>;
	onClearKey: () => Promise<void>;
}

export function AiApiKeySection({
	apiKeyDraft,
	secretConfigured,
	keySaved,
	onApiKeyDraftChange,
	onSaveKey,
	onClearKey,
}: AiApiKeySectionProps) {
	return (
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
						onChange={(event) => onApiKeyDraftChange(event.target.value)}
					/>
					<button type="button" onClick={() => void onSaveKey()}>
						Save
					</button>
					{secretConfigured ? (
						<button type="button" onClick={() => void onClearKey()}>
							Clear
						</button>
					) : null}
				</div>
			</div>

			{keySaved ? <div className="settingsKeySaved">API key saved</div> : null}
		</section>
	);
}
