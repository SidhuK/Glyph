import { useCallback, useEffect, useRef, useState } from "react";
import { type AiModel, invoke } from "../../../lib/tauri";

interface AiModelComboboxProps {
	profileId: string;
	value: string;
	secretConfigured: boolean | null;
	onChange: (modelId: string) => void;
}

export function AiModelCombobox({
	profileId,
	value,
	secretConfigured,
	onChange,
}: AiModelComboboxProps) {
	const [models, setModels] = useState<AiModel[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const lastSecretConfiguredRef = useRef<boolean | null>(secretConfigured);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset cache when profile changes
	useEffect(() => {
		setModels(null);
		setError("");
	}, [profileId]);

	const fetchModels = useCallback(async () => {
		if (models || loading) return;
		setLoading(true);
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
	}, [models, loading, profileId]);

	useEffect(() => {
		void fetchModels();
	}, [fetchModels]);

	useEffect(() => {
		if (secretConfigured === true && lastSecretConfiguredRef.current !== true) {
			setModels(null);
			setError("");
			setLoading(false);
			void fetchModels();
		}
		lastSecretConfiguredRef.current = secretConfigured;
	}, [secretConfigured, fetchModels]);

	const handleRetry = useCallback(() => {
		setModels(null);
		setError("");
		setLoading(true);
		void (async () => {
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
		})();
	}, [profileId]);

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
					disabled={loading || !models}
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
