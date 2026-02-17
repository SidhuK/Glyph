import { useCallback, useEffect, useRef, useState } from "react";
import { type AiModel, type AiProviderKind, invoke } from "../../../lib/tauri";

interface AiModelComboboxProps {
	profileId: string;
	provider: AiProviderKind;
	value: string;
	secretConfigured: boolean | null;
	onChange: (modelId: string) => void;
}

const providerNeedsApiKey = (provider: AiProviderKind): boolean =>
	provider !== "ollama";

export function AiModelCombobox({
	profileId,
	provider,
	value,
	secretConfigured,
	onChange,
}: AiModelComboboxProps) {
	const [models, setModels] = useState<AiModel[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
	const lastSecretConfiguredRef = useRef<boolean | null>(secretConfigured);
	const requiresApiKey = providerNeedsApiKey(provider);
	const canFetchModels = !requiresApiKey || secretConfigured === true;

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset cache when profile changes
	useEffect(() => {
		setModels(null);
		setError("");
		setHasAttemptedFetch(false);
	}, [profileId, provider]);

	const fetchModels = useCallback(
		async (force = false) => {
			if (!force && (models || loading || hasAttemptedFetch)) return;
			setLoading(true);
			setHasAttemptedFetch(true);
			setError("");
			try {
				const result = await invoke("ai_models_list", {
					profile_id: profileId,
				});
				setModels(result);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setLoading(false);
			}
		},
		[models, loading, hasAttemptedFetch, profileId],
	);

	useEffect(() => {
		if (!canFetchModels || hasAttemptedFetch) return;
		void fetchModels();
	}, [canFetchModels, hasAttemptedFetch, fetchModels]);

	useEffect(() => {
		if (
			canFetchModels &&
			secretConfigured === true &&
			lastSecretConfiguredRef.current !== true
		) {
			setModels(null);
			setError("");
			setLoading(false);
			setHasAttemptedFetch(false);
			void fetchModels(true);
		}
		lastSecretConfiguredRef.current = secretConfigured;
	}, [canFetchModels, secretConfigured, fetchModels]);

	const handleRetry = useCallback(() => {
		if (!canFetchModels) return;
		setModels(null);
		setError("");
		setHasAttemptedFetch(false);
		void fetchModels(true);
	}, [canFetchModels, fetchModels]);

	const statusLabel = loading
		? "Connecting…"
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
					<option value="">Select a model…</option>
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
