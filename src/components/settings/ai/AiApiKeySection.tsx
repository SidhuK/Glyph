import { Button } from "../../ui/shadcn/button";
import { Input } from "../../ui/shadcn/input";
import { SettingsRow, SettingsSection } from "../SettingsScaffold";
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
		<SettingsSection
			title="API Key"
			description="Stored locally in the secure secret store used by Glyph."
			aside={
				<div
					className={`settingsPill ${toneForSecretConfigured(secretConfigured)}`}
				>
					{secretConfigured == null
						? "Unknown"
						: secretConfigured
							? "Active"
							: "Missing"}
				</div>
			}
		>
			<SettingsRow
				label={secretConfigured ? "Update key" : "Set key"}
				description="Paste a provider key, save it locally, or clear the current stored secret."
				stacked
			>
				<div className="settingsInline settingsInlineWide">
					<Input
						id="aiApiKeyInput"
						type="password"
						placeholder="Paste key..."
						value={apiKeyDraft}
						onChange={(event) => onApiKeyDraftChange(event.target.value)}
					/>
					<div className="settingsActions">
						<Button type="button" size="sm" onClick={() => void onSaveKey()}>
							Save
						</Button>
						{secretConfigured ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => void onClearKey()}
							>
								Clear
							</Button>
						) : null}
					</div>
				</div>
				{keySaved ? (
					<div className="settingsKeySaved">API key saved</div>
				) : null}
			</SettingsRow>
		</SettingsSection>
	);
}
