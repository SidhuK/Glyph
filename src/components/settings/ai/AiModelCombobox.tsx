import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { type AiModel, type AiProviderKind, invoke } from "../../../lib/tauri";
import { SettingsSelect } from "../SettingsSelect";
import { providerNeedsApiKey } from "./providerCapabilities";

interface AiModelComboboxProps {
	profileId: string;
	provider: AiProviderKind;
	value: string;
	secretConfigured: boolean | null;
	onChange: (modelId: string) => void;
	onModelsChange?: (models: AiModel[] | null) => void;
}

export function AiModelCombobox({
	profileId,
	provider,
	value,
	secretConfigured,
	onChange,
	onModelsChange,
}: AiModelComboboxProps) {
	const { t } = useTranslation("settings.ai");
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
		? t("model.connecting")
		: models
			? t("model.count", { count: models.length })
			: null;

	return (
		<div className="modelCombobox">
			<div className="modelComboboxInputWrap">
				<SettingsSelect
					id="aiModel"
					value={value}
					options={[
						{ value: "", label: t("model.placeholder") },
						...(models ?? []).map((m) => ({ value: m.id, label: m.name })),
					]}
					onValueChange={onChange}
					disabled={loading || !models || !canFetchModels}
				/>
				{statusLabel ? (
					<span className={`modelComboboxBadge ${loading ? "modelComboboxBadgeLoading" : ""}`}>
						{statusLabel}
					</span>
				) : null}
			</div>
			{!canFetchModels ? <div className="modelComboboxStatus">{t("model.needsApiKey")}</div> : null}
			{error ? (
				<div className="modelComboboxStatus modelComboboxError">
					<span>{error}</span>
					<button type="button" className="modelComboboxRetry" onClick={handleRetry}>
						{t("model.retry")}
					</button>
				</div>
			) : null}
			{!loading && !error && models?.length === 0 ? (
				<div className="modelComboboxStatus">{t("model.empty")}</div>
			) : null}
		</div>
	);
}
