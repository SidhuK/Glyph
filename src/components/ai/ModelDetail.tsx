import type { AiModel, ProviderSupportEntry } from "../../lib/tauri";
import styles from "./ModelSelector.module.css";
import { formatEndpointLabel } from "./modelSelectorConstants";

export function hasDetailData(
	model: AiModel,
	providerSupport?: ProviderSupportEntry | null,
): boolean {
	const hasProviderSupport = Boolean(
		providerSupport &&
			Object.values(providerSupport.endpoints).some((enabled) => enabled),
	);
	return Boolean(
		model.context_length ||
			model.max_completion_tokens ||
			model.description ||
			model.prompt_pricing ||
			model.completion_pricing ||
			model.input_modalities?.length ||
			model.output_modalities?.length ||
			model.tokenizer ||
			model.supported_parameters?.length ||
			hasProviderSupport,
	);
}

function formatPrice(perToken: string): string {
	const n = Number.parseFloat(perToken);
	if (Number.isNaN(n) || n === 0) return "Free";
	const perMillion = n * 1_000_000;
	return `$${perMillion < 0.01 ? perMillion.toFixed(4) : perMillion.toFixed(2)}/M`;
}

export function ModelDetail({
	model,
	providerSupport,
}: {
	model: AiModel;
	providerSupport?: ProviderSupportEntry | null;
}) {
	const hasModalities =
		model.input_modalities?.length || model.output_modalities?.length;
	const hasParams = model.supported_parameters?.length;
	const supportedEndpointEntries = providerSupport
		? Object.entries(providerSupport.endpoints).filter(([, enabled]) => enabled)
		: [];

	return (
		<div className={styles.detailPanel}>
			<div className={styles.detailName}>{model.name}</div>
			<div className={styles.detailId}>{model.id}</div>

			{(model.context_length != null ||
				model.max_completion_tokens != null) && (
				<div className={styles.detailSection}>
					{model.context_length != null && (
						<div className={styles.detailRow}>
							<span className={styles.detailLabel}>Context</span>
							<span className={styles.detailValue}>
								{model.context_length.toLocaleString()} tokens
							</span>
						</div>
					)}
					{model.max_completion_tokens != null && (
						<div className={styles.detailRow}>
							<span className={styles.detailLabel}>Max output</span>
							<span className={styles.detailValue}>
								{model.max_completion_tokens.toLocaleString()} tokens
							</span>
						</div>
					)}
				</div>
			)}

			{(model.prompt_pricing || model.completion_pricing) && (
				<div className={styles.detailSection}>
					<span className={styles.detailSectionTitle}>Pricing</span>
					<div className={styles.detailTags}>
						{model.prompt_pricing && (
							<span className={styles.detailTag}>
								Input: {formatPrice(model.prompt_pricing)}
							</span>
						)}
						{model.completion_pricing && (
							<span className={styles.detailTag}>
								Output: {formatPrice(model.completion_pricing)}
							</span>
						)}
					</div>
				</div>
			)}

			{hasModalities ? (
				<div className={styles.detailSection}>
					<span className={styles.detailSectionTitle}>Modalities</span>
					<div className={styles.detailTags}>
						{model.input_modalities?.map((m) => (
							<span key={`in-${m}`} className={styles.detailTag}>
								{m}
							</span>
						))}
						{model.output_modalities?.map((m) => (
							<span key={`out-${m}`} className={styles.detailTag}>
								{m} (out)
							</span>
						))}
					</div>
				</div>
			) : null}

			{model.tokenizer && (
				<div className={styles.detailRow}>
					<span className={styles.detailLabel}>Tokenizer</span>
					<span className={styles.detailValue}>{model.tokenizer}</span>
				</div>
			)}

			{hasParams ? (
				<div className={styles.detailSection}>
					<span className={styles.detailSectionTitle}>Capabilities</span>
					<div className={styles.detailTags}>
						{model.supported_parameters?.map((p) => (
							<span key={p} className={styles.detailTag}>
								{p}
							</span>
						))}
					</div>
				</div>
			) : null}

			{providerSupport && supportedEndpointEntries.length > 0 && (
				<div className={styles.detailSection}>
					<span className={styles.detailSectionTitle}>
						{providerSupport.display_name} support
					</span>
					<div className={styles.detailTags}>
						{supportedEndpointEntries.map(([endpoint]) => (
							<span key={endpoint} className={styles.detailTag}>
								{formatEndpointLabel(endpoint)}
							</span>
						))}
					</div>
					<a
						className={styles.detailLink}
						href={providerSupport.url}
						target="_blank"
						rel="noreferrer"
					>
						View {providerSupport.display_name} docs
					</a>
				</div>
			)}

			{model.description && (
				<div className={styles.detailDescription}>{model.description}</div>
			)}

			{!model.context_length &&
				!model.description &&
				!hasModalities &&
				!hasParams && (
					<div className={styles.detailValue}>
						No additional details available.
					</div>
				)}
		</div>
	);
}
