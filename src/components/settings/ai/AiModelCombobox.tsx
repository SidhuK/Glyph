import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { type AiModel, type AiProviderKind, invoke } from "../../../lib/tauri";
import { SettingsSelect } from "../SettingsSelect";

interface AiModelComboboxProps {
	profileId: string;
	provider: AiProviderKind;
	value: string;
	secretConfigured: boolean | null;
	onChange: (modelId: string) => void;
	onModelsChange?: (models: AiModel[] | null) => void;
}

const PROVIDERS_NO_API_KEY = new Set<AiProviderKind>([
	"ollama",
	"llama_cpp",
	"codex_chatgpt",
	"amp",
	"claude_code",
	"opencode",
	"pi",
]);

const providerNeedsApiKey = (provider: AiProviderKind): boolean =>
	!PROVIDERS_NO_API_KEY.has(provider);

export function AiModelCombobox({
	profileId,
	provider,
	value,
	secretConfigured,
	onChange,
	onModelsChange,
}: AiModelComboboxProps) {
	const { t } = useTranslation("settings");
	const requiresApiKey = providerNeedsApiKey(provider);
	const canFetchModels = !requiresApiKey || secretConfigured === true;
	const modelsQuery = useQuery({
		queryKey: ["ai", "models", profileId, provider],
		queryFn: () =>
			invoke("ai_models_list", {
				profile_id: profileId,
				provider,
			}),
		enabled: canFetchModels,
	});
	const models = canFetchModels ? (modelsQuery.data ?? null) : null;
	const loading = canFetchModels && modelsQuery.isFetching;
	const error =
		canFetchModels && modelsQuery.error
			? modelsQuery.error instanceof Error
				? modelsQuery.error.message
				: String(modelsQuery.error)
			: "";

	useEffect(() => {
		onModelsChange?.(models);
	}, [models, onModelsChange]);

	const handleRetry = useCallback(() => {
		if (!canFetchModels) return;
		onModelsChange?.(null);
		void modelsQuery.refetch();
	}, [canFetchModels, modelsQuery, onModelsChange]);

	const statusLabel = loading
		? t("ai.modelCombobox.connecting")
		: models
			? t("ai.modelCombobox.models", { count: models.length })
			: null;

	return (
		<div className="modelCombobox">
			<div className="modelComboboxInputWrap">
				<SettingsSelect
					id="aiModel"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={loading || !models || !canFetchModels}
				>
					<option value="">{t("ai.modelCombobox.selectModel")}</option>
					{models?.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name}
						</option>
					))}
				</SettingsSelect>
				{statusLabel ? (
					<span
						className={`modelComboboxBadge ${loading ? "modelComboboxBadgeLoading" : ""}`}
					>
						{statusLabel}
					</span>
				) : null}
			</div>
			{!canFetchModels ? (
				<div className="modelComboboxStatus">
					{t("ai.modelCombobox.saveApiKeyHint")}
				</div>
			) : null}
			{error ? (
				<div className="modelComboboxStatus modelComboboxError">
					<span>{error}</span>
					<button
						type="button"
						className="modelComboboxRetry"
						onClick={handleRetry}
					>
						{t("ai.modelCombobox.retry")}
					</button>
				</div>
			) : null}
			{!loading && !error && models?.length === 0 ? (
				<div className="modelComboboxStatus">
					{t("ai.modelCombobox.noModels")}
				</div>
			) : null}
		</div>
	);
}
