import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { type AiModel, type AiProviderKind, invoke } from "../../../lib/tauri";

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
		? "Connecting..."
		: models
			? `${models.length} models`
			: null;

	return (
		<div className="modelCombobox">
			<div className="modelComboboxInputWrap">
				<select
					id="aiModel"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={loading || !models || !canFetchModels}
				>
					<option value="">Select a model...</option>
					{models?.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name}
						</option>
					))}
				</select>
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
					Save an API key to load models for this provider.
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
						Retry
					</button>
				</div>
			) : null}
			{!loading && !error && models?.length === 0 ? (
				<div className="modelComboboxStatus">No models available</div>
			) : null}
		</div>
	);
}
