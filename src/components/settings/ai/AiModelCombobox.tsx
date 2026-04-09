import { useCallback, useEffect, useRef, useState } from "react";
import { type AiModel, type AiProviderKind, invoke } from "../../../lib/tauri";

interface AiModelComboboxProps {
	profileId: string;
	provider: AiProviderKind;
	value: string;
	secretConfigured: boolean | null;
	onChange: (modelId: string) => void;
	onModelsChange?: (models: AiModel[] | null) => void;
}

const providerNeedsApiKey = (provider: AiProviderKind): boolean =>
	provider !== "ollama" && provider !== "codex_chatgpt";

interface ModelFetchState {
	models: AiModel[] | null;
	loading: boolean;
	error: string;
	hasAttemptedFetch: boolean;
}

const INITIAL_MODEL_FETCH_STATE: ModelFetchState = {
	models: null,
	loading: false,
	error: "",
	hasAttemptedFetch: false,
};

export function AiModelCombobox({
	profileId,
	provider,
	value,
	secretConfigured,
	onChange,
	onModelsChange,
}: AiModelComboboxProps) {
	const [modelFetchState, setModelFetchState] = useState<ModelFetchState>(
		INITIAL_MODEL_FETCH_STATE,
	);
	const requiresApiKey = providerNeedsApiKey(provider);
	const canFetchModels = !requiresApiKey || secretConfigured === true;
	const visibleFetchState = canFetchModels
		? modelFetchState
		: INITIAL_MODEL_FETCH_STATE;
	const { models, loading, error } = visibleFetchState;
	const { hasAttemptedFetch } = modelFetchState;
	const modelFetchStateRef = useRef(modelFetchState);
	modelFetchStateRef.current = modelFetchState;

	const fetchModels = useCallback(
		async (force = false) => {
			const current = modelFetchStateRef.current;
			if (
				!force &&
				(current.models || current.loading || current.hasAttemptedFetch)
			) {
				return;
			}
			const nextState: ModelFetchState = {
				models: force ? null : current.models,
				loading: true,
				error: "",
				hasAttemptedFetch: true,
			};
			setModelFetchState(nextState);
			try {
				const result = await invoke("ai_models_list", {
					profile_id: profileId,
					provider,
				});
				setModelFetchState({
					models: result,
					loading: false,
					error: "",
					hasAttemptedFetch: true,
				});
				onModelsChange?.(result);
			} catch (e) {
				setModelFetchState({
					models: null,
					loading: false,
					error: e instanceof Error ? e.message : String(e),
					hasAttemptedFetch: true,
				});
				onModelsChange?.(null);
			}
		},
		[onModelsChange, profileId, provider],
	);

	useEffect(() => {
		if (!canFetchModels || hasAttemptedFetch) return;
		void fetchModels();
	}, [canFetchModels, hasAttemptedFetch, fetchModels]);

	useEffect(() => {
		if (canFetchModels || modelFetchState === INITIAL_MODEL_FETCH_STATE) return;
		setModelFetchState(INITIAL_MODEL_FETCH_STATE);
		onModelsChange?.(null);
	}, [canFetchModels, modelFetchState, onModelsChange]);

	const handleRetry = useCallback(() => {
		if (!canFetchModels) return;
		onModelsChange?.(null);
		void fetchModels(true);
	}, [canFetchModels, fetchModels, onModelsChange]);

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
