import type { AiModel, AiProfile, AiProviderKind } from "../../../lib/tauri";
import { Input } from "../../ui/shadcn/input";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "../SettingsScaffold";
import { AiModelCombobox } from "./AiModelCombobox";

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
	const selectedModel =
		availableModels?.find((model) => model.id === profileDraft.model) ?? null;
	const reasoningOptions = selectedModel?.reasoning_effort ?? null;
	const shouldShowReasoningSelect = profileDraft.provider === "codex_chatgpt";

	return (
		<SettingsSection
			title="Provider"
			description="Choose the service, model, and advanced connection fields. Provider changes switch to that provider's saved setup; other edits save automatically."
		>
			<SettingsRow
				label="Service"
				htmlFor="aiProvider"
				description="Switch between provider configurations."
			>
				<div className="settingsInline settingsInlineWide">
					<select
						id="aiProvider"
						value={profileDraft.provider}
						onChange={(event) =>
							void onProviderChange(event.target.value as AiProviderKind)
						}
					>
						<option value="codex_chatgpt">Codex (ChatGPT)</option>
						<option value="openai">OpenAI</option>
						<option value="openrouter">OpenRouter</option>
						<option value="anthropic">Anthropic</option>
						<option value="gemini">Gemini</option>
						<option value="ollama">Ollama</option>
						<option value="llama_cpp">llama.cpp</option>
						<option value="openai_compat">OpenAI-compatible</option>
					</select>
				</div>
			</SettingsRow>

			<SettingsRow
				label="Model"
				htmlFor="aiModel"
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
					htmlFor="aiReasoningEffort"
					description="Available for Codex when the current model exposes effort levels."
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
						<div>
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

			{profileDraft.provider === "openai_compat" ||
			profileDraft.provider === "llama_cpp" ? (
				<SettingsRow
					label="Base URL"
					htmlFor="aiBaseUrl"
					description={
						profileDraft.provider === "llama_cpp"
							? "Default is http://localhost:8080/v1 for a local llama.cpp server."
							: "Only needed for custom OpenAI-compatible providers."
					}
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

			{profileDraft.provider === "openai_compat" ||
			profileDraft.provider === "llama_cpp" ? (
				<SettingsRow
					label="Allow local network"
					description={
						profileDraft.provider === "llama_cpp"
							? "Enable to use localhost or private-network llama.cpp endpoints."
							: "Enable to use http:// endpoints on localhost or private networks (e.g. LM Studio, vLLM)."
					}
				>
					<SettingsToggle
						ariaLabel="Allow local network"
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
