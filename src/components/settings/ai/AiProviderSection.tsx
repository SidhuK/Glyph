import type { AiModel, AiProfile } from "../../../lib/tauri";
import { Button } from "../../ui/shadcn/button";
import { Input } from "../../ui/shadcn/input";
import { SettingsRow, SettingsSection } from "../SettingsScaffold";
import { AiModelCombobox } from "./AiModelCombobox";

interface AiProviderSectionProps {
	profileDraft: AiProfile;
	availableModels: AiModel[] | null;
	secretConfigured: boolean | null;
	onModelsChange: (models: AiModel[] | null) => void;
	onUpdateDraft: (updater: (prev: AiProfile) => AiProfile) => void;
	onPersistDraft: (draft: AiProfile) => Promise<void>;
	onSave: () => Promise<void>;
}

export function AiProviderSection({
	profileDraft,
	availableModels,
	secretConfigured,
	onModelsChange,
	onUpdateDraft,
	onPersistDraft,
	onSave,
}: AiProviderSectionProps) {
	const selectedModel =
		availableModels?.find((model) => model.id === profileDraft.model) ?? null;
	const reasoningOptions = selectedModel?.reasoning_effort ?? null;
	const shouldShowReasoningSelect = profileDraft.provider === "codex_chatgpt";

	return (
		<SettingsSection
			title="Provider"
			description="Choose the service, model, and advanced connection fields. Service and model changes save automatically; text fields save on blur."
		>
			<SettingsRow
				label="Service"
				description="Pick the provider backing this profile."
			>
				<select
					id="aiProvider"
					value={profileDraft.provider}
					onChange={(event) => {
						const nextProvider = event.target.value as AiProfile["provider"];
						void onPersistDraft({
							...profileDraft,
							provider: nextProvider,
							reasoning_effort:
								nextProvider === "codex_chatgpt"
									? (profileDraft.reasoning_effort ?? null)
									: null,
						});
					}}
				>
					<option value="codex_chatgpt">Codex (ChatGPT)</option>
					<option value="openai">OpenAI</option>
					<option value="openrouter">OpenRouter</option>
					<option value="anthropic">Anthropic</option>
					<option value="gemini">Gemini</option>
					<option value="ollama">Ollama</option>
					<option value="openai_compat">OpenAI-compatible</option>
				</select>
			</SettingsRow>

			<SettingsRow
				label="Model"
				description="Glyph fetches available models for the selected provider when credentials allow it."
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
								profileDraft.provider === "codex_chatgpt"
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
					label="Reasoning level"
					description="Available for Codex profiles when the current model exposes effort levels."
				>
					{(reasoningOptions?.length ?? 0) > 0 ? (
						<select
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
						</select>
					) : (
						<div className="settingsFieldControl settingsFieldControlStacked">
							<Input
								id="aiReasoningEffort"
								value={profileDraft.reasoning_effort ?? ""}
								placeholder="e.g. low, medium, high"
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
								This model did not publish reasoning options; enter effort
								manually.
							</div>
						</div>
					)}
				</SettingsRow>
			) : null}

			{profileDraft.provider === "openai_compat" ? (
				<SettingsRow
					label="Base URL"
					description="Only needed for custom OpenAI-compatible providers."
				>
					<Input
						id="aiBaseUrl"
						placeholder="https://api.example.com/v1"
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

			<SettingsRow
				label="Profile"
				description="Save the current draft if you want to force a refresh after manual edits."
			>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => void onSave()}
				>
					Save Profile
				</Button>
			</SettingsRow>
		</SettingsSection>
	);
}
