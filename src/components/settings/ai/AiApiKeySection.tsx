import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation(["settings", "common"]);
	return (
		<SettingsSection
			title={t("ai.apiKey.title")}
			description={t("ai.apiKey.description")}
			aside={
				<div
					className={`settingsPill ${toneForSecretConfigured(secretConfigured)}`}
				>
					{secretConfigured == null
						? t("ai.apiKey.unknown")
						: secretConfigured
							? t("ai.apiKey.active")
							: t("ai.apiKey.missing")}
				</div>
			}
		>
			<SettingsRow
				label={
					secretConfigured ? t("ai.apiKey.updateKey") : t("ai.apiKey.setKey")
				}
				htmlFor="aiApiKeyInput"
				description={t("ai.apiKey.keyDescription")}
				stacked
			>
				<div className="settingsInline settingsInlineWide">
					<Input
						id="aiApiKeyInput"
						type="password"
						placeholder={t("ai.apiKey.placeholder")}
						value={apiKeyDraft}
						onChange={(event) => onApiKeyDraftChange(event.target.value)}
					/>
					<div className="settingsActions">
						<Button type="button" size="sm" onClick={() => void onSaveKey()}>
							{t("settings:common.save")}
						</Button>
						{secretConfigured ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => void onClearKey()}
							>
								{t("settings:common.clear")}
							</Button>
						) : null}
					</div>
				</div>
				{keySaved ? (
					<output className="settingsKeySaved" aria-live="polite">
						{t("ai.apiKey.saved")}
					</output>
				) : null}
			</SettingsRow>
		</SettingsSection>
	);
}
