import { useTranslation } from "react-i18next";
import type { AiModel, AiProfile, AiProviderKind } from "../../../lib/tauri";
import { Input } from "../../ui/shadcn/input";
import { SettingsRow, SettingsSection, SettingsToggle } from "../SettingsScaffold";
import { SettingsSelect } from "../SettingsSelect";
import { AiConnectionPicker } from "./AiConnectionPicker";
import { AiModelCombobox } from "./AiModelCombobox";

function usesReasoningControl(provider: AiProviderKind): boolean {
	return provider === "codex_chatgpt" || provider === "pi" || provider === "grok";
}

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
	const { t } = useTranslation("settings.ai");
	const selectedModel = availableModels?.find((model) => model.id === profileDraft.model) ?? null;
	const reasoningOptions = selectedModel?.reasoning_effort ?? null;
	const shouldShowReasoningSelect = usesReasoningControl(profileDraft.provider);
	const chatNamingModel = profileDraft.chat_naming_model;
	const chatNamingOptions = [
		{ value: "", label: t("chatNaming.sameModel") },
		...(chatNamingModel && !availableModels?.some((model) => model.id === chatNamingModel)
			? [{ value: chatNamingModel, label: chatNamingModel }]
			: []),
		...(availableModels ?? []).map((model) => ({ value: model.id, label: model.name })),
	];
	const baseUrlPlaceholder =
		profileDraft.provider === "llama_cpp"
			? "http://localhost:8080/v1"
			: "https://api.example.com/v1";

	return (
		<SettingsSection
			title={t("connection.sectionTitle")}
			description={t("connection.sectionDescription")}
		>
			<AiConnectionPicker provider={profileDraft.provider} onProviderChange={onProviderChange} />

			<SettingsRow label={t("model.label")} htmlFor="aiModel" description={t("model.description")}>
				<AiModelCombobox
					key={`${profileDraft.id}:${profileDraft.provider}`}
					profileId={profileDraft.id}
					provider={profileDraft.provider}
					value={profileDraft.model}
					secretConfigured={secretConfigured}
					onChange={(nextModelId) => {
						const nextModel = availableModels?.find((entry) => entry.id === nextModelId) ?? null;
						const currentEffort = profileDraft.reasoning_effort ?? null;
						const stillValid = !!nextModel?.reasoning_effort?.some(
							(option) => option.effort === currentEffort,
						);
						void onPersistDraft({
							...profileDraft,
							model: nextModelId,
							reasoning_effort: usesReasoningControl(profileDraft.provider)
								? stillValid
									? currentEffort
									: (nextModel?.default_reasoning_effort ?? currentEffort)
								: null,
						});
					}}
					onModelsChange={onModelsChange}
				/>
			</SettingsRow>

			{["codex_chatgpt", "claude_code", "cursor", "opencode"].includes(profileDraft.provider) ? (
				<SettingsRow
					label={t("chatNaming.label")}
					searchId="ai-chat-naming-model"
					htmlFor="aiChatNamingModel"
					description={t("chatNaming.description")}
				>
					<SettingsSelect
						id="aiChatNamingModel"
						value={chatNamingModel ?? ""}
						options={chatNamingOptions}
						onValueChange={(model) =>
							void onPersistDraft({ ...profileDraft, chat_naming_model: model || null })
						}
					/>
				</SettingsRow>
			) : null}

			{shouldShowReasoningSelect ? (
				<SettingsRow
					label={t("reasoning.label")}
					htmlFor="aiReasoningEffort"
					description={t("reasoning.description")}
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
							options={(reasoningOptions ?? []).map((option) => ({
								value: option.effort,
								label: option.description
									? `${option.effort} - ${option.description}`
									: option.effort,
							}))}
							onValueChange={(effort) =>
								void onPersistDraft({ ...profileDraft, reasoning_effort: effort || null })
							}
						/>
					) : (
						<div>
							<Input
								id="aiReasoningEffort"
								value={profileDraft.reasoning_effort ?? ""}
								placeholder={t("reasoning.placeholder")}
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
							<div className="settingsHint">{t("reasoning.manualHint")}</div>
						</div>
					)}
				</SettingsRow>
			) : null}

			{profileDraft.provider === "openai_compat" || profileDraft.provider === "llama_cpp" ? (
				<SettingsRow
					label={t("baseUrl.label")}
					htmlFor="aiBaseUrl"
					description={
						profileDraft.provider === "llama_cpp"
							? t("baseUrl.descriptionLlama")
							: t("baseUrl.descriptionCustom")
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

			{profileDraft.provider === "openai_compat" || profileDraft.provider === "llama_cpp" ? (
				<SettingsRow
					label={t("localNetwork.label")}
					description={
						profileDraft.provider === "llama_cpp"
							? t("localNetwork.descriptionLlama")
							: t("localNetwork.descriptionCustom")
					}
				>
					<SettingsToggle
						ariaLabel={t("localNetwork.label")}
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
