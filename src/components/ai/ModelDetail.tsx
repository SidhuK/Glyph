import { useTranslation } from "react-i18next";
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

function formatPrice(perToken: string, freeLabel: string): string {
	const n = Number.parseFloat(perToken);
	if (Number.isNaN(n) || n === 0) return freeLabel;
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
	const { i18n, t } = useTranslation("ui");
	const locale = i18n.resolvedLanguage ?? i18n.language;
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
							<span className={styles.detailLabel}>{t("ai.context")}</span>
							<span className={styles.detailValue}>
								{model.context_length.toLocaleString(locale)} {t("ai.tokens")}
							</span>
						</div>
					)}
					{model.max_completion_tokens != null && (
						<div className={styles.detailRow}>
							<span className={styles.detailLabel}>{t("ai.maxOutput")}</span>
							<span className={styles.detailValue}>
								{model.max_completion_tokens.toLocaleString(locale)}{" "}
								{t("ai.tokens")}
							</span>
						</div>
					)}
				</div>
			)}

			{(model.prompt_pricing || model.completion_pricing) && (
				<div className={styles.detailSection}>
					<span className={styles.detailSectionTitle}>{t("ai.pricing")}</span>
					<div className={styles.detailTags}>
						{model.prompt_pricing && (
							<span className={styles.detailTag}>
								{t("ai.input")}:{" "}
								{formatPrice(model.prompt_pricing, t("ai.free"))}
							</span>
						)}
						{model.completion_pricing && (
							<span className={styles.detailTag}>
								{t("ai.output")}:{" "}
								{formatPrice(model.completion_pricing, t("ai.free"))}
							</span>
						)}
					</div>
				</div>
			)}

			{hasModalities ? (
				<div className={styles.detailSection}>
					<span className={styles.detailSectionTitle}>
						{t("ai.modalities")}
					</span>
					<div className={styles.detailTags}>
						{model.input_modalities?.map((m) => (
							<span key={`in-${m}`} className={styles.detailTag}>
								{m}
							</span>
						))}
						{model.output_modalities?.map((m) => (
							<span key={`out-${m}`} className={styles.detailTag}>
								{m} ({t("ai.outputSuffix")})
							</span>
						))}
					</div>
				</div>
			) : null}

			{model.tokenizer && (
				<div className={styles.detailRow}>
					<span className={styles.detailLabel}>{t("ai.tokenizer")}</span>
					<span className={styles.detailValue}>{model.tokenizer}</span>
				</div>
			)}

			{hasParams ? (
				<div className={styles.detailSection}>
					<span className={styles.detailSectionTitle}>
						{t("ai.capabilities")}
					</span>
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
						{t("ai.providerSupport", {
							provider: providerSupport.display_name,
						})}
					</span>
					<div className={styles.detailTags}>
						{supportedEndpointEntries.map(([endpoint]) => (
							<span key={endpoint} className={styles.detailTag}>
								{formatEndpointLabel(endpoint)}
							</span>
						))}
					</div>
					{providerSupport.url && (
						<a
							className={styles.detailLink}
							href={providerSupport.url}
							target="_blank"
							rel="noreferrer"
						>
							{t("ai.viewProviderDocs", {
								provider: providerSupport.display_name,
							})}
						</a>
					)}
				</div>
			)}

			{model.description && (
				<div className={styles.detailDescription}>{model.description}</div>
			)}

			{!model.context_length &&
				!model.description &&
				!hasModalities &&
				!hasParams && (
					<div className={styles.detailValue}>{t("ai.noDetails")}</div>
				)}
		</div>
	);
}
