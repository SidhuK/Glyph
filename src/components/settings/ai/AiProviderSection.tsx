import type { AiModel, AiProfile } from "../../../lib/tauri";
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
		<section className="settingsCard settingsSpan">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">Provider</div>
					<div className="settingsCardHint">
						Choose service, model, and advanced options. Service and model
						changes save automatically; manual fields save on blur.
					</div>
				</div>
			</div>

			<div className="settingsField">
				<div>
					<label className="settingsLabel" htmlFor="aiProvider">
						Service
					</label>
				</div>
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
					<option value="codex_chatgpt">Codex (ChatGPT OAuth)</option>
					<option value="openai">OpenAI</option>
					<option value="openrouter">OpenRouter</option>
					<option value="anthropic">Anthropic</option>
					<option value="gemini">Gemini</option>
					<option value="ollama">Ollama</option>
					<option value="openai_compat">OpenAI-compatible</option>
				</select>
			</div>

			<div className="settingsField">
				<div>
					<label className="settingsLabel" htmlFor="aiModel">
						Model
					</label>
				</div>
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
			</div>

			{shouldShowReasoningSelect ? (
				<div className="settingsField">
					<div>
						<label className="settingsLabel" htmlFor="aiReasoningEffort">
							Reasoning level
						</label>
					</div>
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
						<>
							<input
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
						</>
					)}
				</div>
			) : null}

			{profileDraft.provider === "openai_compat" ? (
				<div className="settingsField">
					<div>
						<label className="settingsLabel" htmlFor="aiBaseUrl">
							Base URL
						</label>
					</div>
					<input
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
				</div>
			) : null}

			<div className="settingsRow">
				<button type="button" onClick={() => void onSave()}>
					Save Profile
				</button>
			</div>
		</section>
	);
}
