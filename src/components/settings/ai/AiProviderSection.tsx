import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AiModel, AiProfile, AiProviderKind } from "../../../lib/tauri";
import { ProviderLogo } from "../../ai/modelSelectorConstants";
import { Input } from "../../ui/shadcn/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../../ui/shadcn/popover";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "../SettingsScaffold";
import { AiModelCombobox } from "./AiModelCombobox";

interface AiProviderOption {
	value: AiProviderKind;
	label: string;
}

interface AiProviderOptionGroup {
	label: string;
	options: AiProviderOption[];
}

const aiProviderGroups: AiProviderOptionGroup[] = [
	{
		label: "Agents",
		options: [
			{ value: "codex_chatgpt", label: "Codex" },
			{ value: "opencode", label: "OpenCode" },
			{ value: "amp", label: "Amp" },
			{ value: "claude_code", label: "Claude Code" },
			{ value: "gemini_cli", label: "Gemini CLI" },
		],
	},
	{
		label: "API",
		options: [
			{ value: "openai", label: "OpenAI" },
			{ value: "anthropic", label: "Anthropic" },
			{ value: "gemini", label: "Google Gemini API" },
			{ value: "openrouter", label: "OpenRouter" },
			{ value: "openai_compat", label: "OpenAI compatible" },
		],
	},
	{
		label: "Local",
		options: [
			{ value: "llama_cpp", label: "llama.cpp" },
			{ value: "ollama", label: "Ollama" },
		],
	},
];

function findProviderOption(provider: AiProviderKind): AiProviderOption {
	for (const group of aiProviderGroups) {
		const option = group.options.find((entry) => entry.value === provider);
		if (option) return option;
	}
	return { value: provider, label: provider };
}

function cliProviderWarning(provider: AiProviderKind): string | null {
	if (provider === "claude_code") {
		return "Use at your own risk. Anthropic’s docs say third-party products should use API key or supported cloud-provider auth and must not route Free, Pro, or Max plan credentials on behalf of users.";
	}
	if (provider === "gemini_cli") {
		return "Use at your own risk. Gemini CLI docs say third-party tools must not piggyback on Gemini CLI OAuth; for third-party coding agents, Google recommends Vertex AI or Google AI Studio API keys.";
	}
	return null;
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
	const selectedModel =
		availableModels?.find((model) => model.id === profileDraft.model) ?? null;
	const reasoningOptions = selectedModel?.reasoning_effort ?? null;
	const shouldShowReasoningSelect = profileDraft.provider === "codex_chatgpt";
	const baseUrlPlaceholder =
		profileDraft.provider === "llama_cpp"
			? "http://localhost:8080/v1"
			: "https://api.example.com/v1";
	const selectedProvider = findProviderOption(profileDraft.provider);
	const providerWarning = cliProviderWarning(profileDraft.provider);

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
					<div
						className="settingsProviderNativeLogo"
						aria-hidden="true"
						data-provider={selectedProvider.value}
					>
						<ProviderLogo
							provider={selectedProvider.value}
							className="settingsProviderNativeLogoImage"
						/>
					</div>
					<select
						id="aiProvider"
						className="settingsProviderNativeSelect"
						value={profileDraft.provider}
						onChange={(event) =>
							void onProviderChange(event.target.value as AiProviderKind)
						}
					>
						{aiProviderGroups.map((group) => (
							<optgroup key={group.label} label={group.label}>
								{group.options.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</optgroup>
						))}
					</select>
					{providerWarning ? (
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="settingsProviderWarningButton"
									aria-label={`${selectedProvider.label} warning`}
								>
									<HugeiconsIcon
										icon={InformationCircleIcon}
										size={16}
										strokeWidth={1.8}
									/>
								</button>
							</PopoverTrigger>
							<PopoverContent
								align="end"
								side="bottom"
								sideOffset={8}
								className="settingsProviderWarningPopover"
							>
								<div className="settingsProviderWarningText">
									{providerWarning}
								</div>
							</PopoverContent>
						</Popover>
					) : null}
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
