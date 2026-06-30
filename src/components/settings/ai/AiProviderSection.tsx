import { useTranslation } from "react-i18next";
import type { AiModel, AiProfile, AiProviderKind } from "../../../lib/tauri";
import { ProviderLogo } from "../../ai/modelSelectorConstants";
import { Input } from "../../ui/shadcn/input";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "../SettingsScaffold";
import { SettingsSelect } from "../SettingsSelect";
import { AiModelCombobox } from "./AiModelCombobox";

const aiProviderGroupKeys = [
	{
		labelKey: "ai.provider.groups.agents",
		values: ["codex_chatgpt", "opencode", "amp", "claude_code", "pi"] as const,
	},
	{
		labelKey: "ai.provider.groups.api",
		values: [
			"openai",
			"anthropic",
			"gemini",
			"openrouter",
			"openai_compat",
		] as const,
	},
	{
		labelKey: "ai.provider.groups.local",
		values: ["llama_cpp", "ollama"] as const,
	},
] as const;

interface AiProviderSectionProps {
	profileDraft: AiProfile;
	availableModels: AiModel[] | null;
	secretConfigured: boolean | null;
	onModelsChange: (models: AiModel[] | null) => void;
	onProviderChange: (provider: AiProviderKind) => Promise<void>;
	onUpdateDraft: (updater: (prev: AiProfile) => AiProfile) => void;
	onPersistDraft: (draft: AiProfile) => Promise<void>;
}

export function AiProviderSection({
	profileDraft,
	availableModels,
	secretConfigured,
	onModelsChange,
	onProviderChange,
	onUpdateDraft,
	onPersistDraft,
}: AiProviderSectionProps) {
	const { t } = useTranslation("settings");
	const providerLabel = (provider: AiProviderKind) =>
		t(`ai.provider.providers.${provider}`, { defaultValue: provider });
	const selectedModel =
		availableModels?.find((model) => model.id === profileDraft.model) ?? null;
	const reasoningOptions = selectedModel?.reasoning_effort ?? null;
	const shouldShowReasoningSelect =
		profileDraft.provider === "codex_chatgpt" || profileDraft.provider === "pi";
	const baseUrlPlaceholder =
		profileDraft.provider === "llama_cpp"
			? "http://localhost:8080/v1"
			: "https://api.example.com/v1";
	const selectedProvider = profileDraft.provider;

	return (
		<SettingsSection
			title={t("ai.provider.title")}
			description={t("ai.provider.description")}
		>
			<SettingsRow
				label={t("ai.provider.service")}
				htmlFor="aiProvider"
				description={t("ai.provider.serviceDescription")}
			>
				<div className="settingsInline settingsInlineWide">
					<div
						className="settingsProviderNativeLogo"
						aria-hidden="true"
						data-provider={selectedProvider}
					>
						<ProviderLogo
							provider={selectedProvider}
							className="settingsProviderNativeLogoImage"
						/>
					</div>
					<SettingsSelect
						id="aiProvider"
						className="settingsProviderNativeSelect"
						value={profileDraft.provider}
						onChange={(event) =>
							void onProviderChange(event.target.value as AiProviderKind)
						}
					>
						{aiProviderGroupKeys.map((group) => (
							<optgroup key={group.labelKey} label={t(group.labelKey)}>
								{group.values.map((value) => (
									<option key={value} value={value}>
										{providerLabel(value)}
									</option>
								))}
							</optgroup>
						))}
					</SettingsSelect>
				</div>
			</SettingsRow>

			<SettingsRow
				label={t("ai.provider.model")}
				htmlFor="aiModel"
				description={t("ai.provider.modelDescription")}
			>
				<AiModelCombobox
					key={`${profileDraft.id}:${profileDraft.provider}`}
					profileId={profileDraft.id}
					provider={profileDraft.provider}
					value={profileDraft.model}
					secretConfigured={secretConfigured}
					onChange={(nextModelId) => {
						const nextModel =
							availableModels?.find((entry) => entry.id === nextModelId) ??
							null;
						const currentEffort = profileDraft.reasoning_effort ?? null;
						const stillValid = !!nextModel?.reasoning_effort?.some(
							(option) => option.effort === currentEffort,
						);
						void onPersistDraft({
							...profileDraft,
							model: nextModelId,
							reasoning_effort:
								profileDraft.provider === "codex_chatgpt" ||
								profileDraft.provider === "pi"
									? stillValid
										? currentEffort
										: (nextModel?.default_reasoning_effort ?? currentEffort)
									: null,
						});
					}}
					onModelsChange={onModelsChange}
				/>
			</SettingsRow>

			{shouldShowReasoningSelect ? (
				<SettingsRow
					label={t("ai.provider.reasoningLevel")}
					htmlFor="aiReasoningEffort"
					description={t("ai.provider.reasoningLevelDescription")}
				>
					{(reasoningOptions?.length ?? 0) > 0 ? (
						<SettingsSelect
							id="aiReasoningEffort"
							value={
								profileDraft.reasoning_effort ??
								selectedModel?.default_reasoning_effort ??
								reasoningOptions?.[0]?.effort ??
								""
							}
							onChange={(event) =>
								void onPersistDraft({
									...profileDraft,
									reasoning_effort: event.target.value || null,
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
						</SettingsSelect>
					) : (
						<div>
							<Input
								id="aiReasoningEffort"
								value={profileDraft.reasoning_effort ?? ""}
								placeholder={t("ai.provider.reasoningPlaceholder")}
								onBlur={(event) =>
									void onPersistDraft({
										...profileDraft,
										reasoning_effort: event.target.value || null,
									})
								}
								onChange={(event) =>
									onUpdateDraft((prev) => ({
										...prev,
										reasoning_effort: event.target.value || null,
									}))
								}
							/>
							<div className="settingsHint">
								{t("ai.provider.reasoningManualHint")}
							</div>
						</div>
					)}
				</SettingsRow>
			) : null}

			{profileDraft.provider === "openai_compat" ||
			profileDraft.provider === "llama_cpp" ? (
				<SettingsRow
					label={t("ai.provider.baseUrl")}
					htmlFor="aiBaseUrl"
					description={
						profileDraft.provider === "llama_cpp"
							? t("ai.provider.baseUrlLlama")
							: t("ai.provider.baseUrlCompat")
					}
				>
					<Input
						id="aiBaseUrl"
						placeholder={baseUrlPlaceholder}
						value={profileDraft.base_url ?? ""}
						onBlur={(event) =>
							void onPersistDraft({
								...profileDraft,
								base_url: event.target.value || null,
							})
						}
						onChange={(event) =>
							onUpdateDraft((prev) => ({
								...prev,
								base_url: event.target.value || null,
							}))
						}
					/>
				</SettingsRow>
			) : null}

			{profileDraft.provider === "openai_compat" ||
			profileDraft.provider === "llama_cpp" ? (
				<SettingsRow
					label={t("ai.provider.allowLocalNetwork")}
					description={
						profileDraft.provider === "llama_cpp"
							? t("ai.provider.allowLocalNetworkLlama")
							: t("ai.provider.allowLocalNetworkCompat")
					}
				>
					<SettingsToggle
						ariaLabel={t("ai.provider.allowLocalNetwork")}
						checked={profileDraft.allow_private_hosts}
						onCheckedChange={(checked) =>
							void onPersistDraft({
								...profileDraft,
								allow_private_hosts: checked,
							})
						}
					/>
				</SettingsRow>
			) : null}
		</SettingsSection>
	);
}
