import {
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { type AiModel, type AiProviderKind, invoke } from "../../lib/tauri";
import { ChevronDown, InformationCircle } from "../Icons";
import styles from "./ModelSelector.module.css";

interface ModelSelectorProps {
	profileId: string | null;
	value: string;
	onChange: (modelId: string) => void;
	provider: AiProviderKind | null;
}

export function ModelSelector({
	profileId,
	value,
	onChange,
	provider,
}: ModelSelectorProps) {
	const [open, setOpen] = useState(false);
	const [models, setModels] = useState<AiModel[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [detailModelId, setDetailModelId] = useState<string | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [dropdownPos, setDropdownPos] = useState<{
		bottom: number;
		right: number;
	} | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset cache when profile changes
	useEffect(() => {
		setModels(null);
		setError("");
	}, [profileId]);

	const fetchModels = useCallback(async () => {
		if (!profileId || models || loading) return;
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
	}, [profileId, models, loading]);

	const handleOpen = useCallback(() => {
		setOpen(true);
		setDetailModelId(null);
		void fetchModels();
	}, [fetchModels]);

	const handleRetry = useCallback(() => {
		setModels(null);
		setError("");
		void (async () => {
			if (!profileId) return;
			setLoading(true);
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

	useLayoutEffect(() => {
		if (!open || !triggerRef.current) return;
		const rect = triggerRef.current.getBoundingClientRect();
		setDropdownPos({
			bottom: window.innerHeight - rect.top + 8,
			right: window.innerWidth - rect.right,
		});
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const handleClick = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				triggerRef.current?.contains(target) ||
				dropdownRef.current?.contains(target)
			) {
				return;
			}
			setOpen(false);
			setDetailModelId(null);
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	const selectedModel = models?.find((m) => m.id === value);
	const displayLabel = selectedModel?.name ?? value ?? "Model";
	const detailModel = detailModelId
		? models?.find((m) => m.id === detailModelId) ?? null
		: null;
	const truncateLabel = (name: string) => {
		if (name.length <= 30) return name;
		return `${name.slice(0, 27)}…`;
	};

	const providerLogoData: Record<
		AiProviderKind,
		{ paths: string[]; viewBox?: string; fill?: string }
	> = {
		Openai: {
			paths: [
				"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
				"M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z",
				"M12 8v8",
				"M12 8a.5.5 0 0 0 0 1",
			],
		},
		Anthropic: {
			paths: [
				"M4 6h16c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2z",
				"M4 14h16",
			],
		},
		Openrouter: {
			paths: [
				"M5 4l14 8-14 8V4z",
				"M12 12l6-3.5",
				"M12 12l-6-3.5",
			],
		},
		Gemini: {
			paths: [
				"M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0z",
				"M9 9l6 6",
				"M15 9l-6 6",
			],
		},
		Ollama: {
			paths: [
				"M5 6h14v12H5z",
				"M5 10h8",
				"M5 14h8",
			],
		},
	};

	const ProviderLogo = ({ provider }: { provider: AiProviderKind | null }) => {
		if (!provider) return null;
		const data = providerLogoData[provider];
		if (!data) return null;
		return (
			<span className={styles.providerIcon} title={provider}>
				<svg viewBox={data.viewBox ?? "0 0 24 24"} fill="none" stroke="currentColor">
					{data.paths.map((d, index) => (
						<path
							key={index}
							d={d}
							strokeWidth={index ? 1.5 : 1.7}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					))}
				</svg>
			</span>
		);
	};

	return (
		<>
				<button
					ref={triggerRef}
					type="button"
					className={styles.trigger}
					onClick={() => (open ? setOpen(false) : handleOpen())}
					title={value || "Select model"}
				>
					{provider && (
						<span className={styles.triggerLogo}>
							<ProviderLogo provider={provider} />
						</span>
					)}
					<span className={styles.triggerLabel}>{displayLabel}</span>
				<span
					className={`${styles.triggerIcon} ${open ? styles.triggerIconOpen : ""}`}
				>
					<ChevronDown size={12} />
				</span>
			</button>

			{open &&
				dropdownPos &&
				createPortal(
					<div
						ref={dropdownRef}
						className={styles.dropdown}
						style={{
							position: "fixed",
							bottom: dropdownPos.bottom,
							right: dropdownPos.right,
						}}
					>
						<div className={styles.dropdownHeader}>
							<span className={styles.dropdownTitle}>Models</span>
							{models && (
								<span className={styles.dropdownCount}>{models.length}</span>
							)}
						</div>

						<div className={styles.dropdownBody}>
							<div className={styles.dropdownList}>
								{loading && (
									<div className={styles.dropdownLoading}>Loading models…</div>
								)}
								{error && (
									<div className={styles.dropdownError}>
										{error}
										<br />
										<button
											type="button"
											className={styles.retryBtn}
											onClick={handleRetry}
										>
											Retry
										</button>
									</div>
								)}
								{!loading && !error && models?.length === 0 && (
									<div className={styles.dropdownEmpty}>
										No models available
									</div>
								)}

								{!loading &&
									!error &&
									models?.map((m) => {
										const detailAvailable = hasDetailData(m);
										const infoActive = detailModel?.id === m.id;
										const handleInfoToggle = () => {
											setDetailModelId((prev) => (prev === m.id ? null : m.id));
										};
										const handleInfoClick = (event: MouseEvent<HTMLSpanElement>) => {
											event.stopPropagation();
											handleInfoToggle();
										};
										const handleInfoKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
											if (event.key === " " || event.key === "Enter") {
												event.preventDefault();
												event.stopPropagation();
												handleInfoToggle();
											}
										};
										return (
											<button
												type="button"
												key={m.id}
												className={`${styles.modelItem} ${
													m.id === value ? styles.modelItemActive : ""
												}`}
												onClick={() => {
													onChange(m.id);
													setOpen(false);
													setDetailModelId(null);
												}}
											>
												<span
													className={styles.modelItemText}
													title={m.name.length > 30 ? m.name : undefined}
												>
													{truncateLabel(m.name)}
												</span>
												{detailAvailable && (
													<span
														role="button"
														tabIndex={0}
														onClick={handleInfoClick}
														onKeyDown={handleInfoKeyDown}
														className={`${styles.infoInline} ${
															infoActive ? styles.infoInlineActive : ""
														}`}
														title="Model info"
														aria-pressed={infoActive}
													>
														<InformationCircle size={14} />
													</span>
												)}
											</button>
										);
									})}
							</div>

							{detailModel && <ModelDetail model={detailModel} />}
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}

function hasDetailData(model: AiModel): boolean {
	return Boolean(
		model.context_length ||
			model.max_completion_tokens ||
			model.description ||
			model.prompt_pricing ||
			model.completion_pricing ||
			model.input_modalities?.length ||
			model.output_modalities?.length ||
			model.tokenizer ||
			model.supported_parameters?.length,
	);
}

function formatPrice(perToken: string): string {
	const n = Number.parseFloat(perToken);
	if (Number.isNaN(n) || n === 0) return "Free";
	const perMillion = n * 1_000_000;
	return `$${perMillion < 0.01 ? perMillion.toFixed(4) : perMillion.toFixed(2)}/M`;
}

function ModelDetail({ model }: { model: AiModel }) {
	const hasModalities =
		model.input_modalities?.length || model.output_modalities?.length;
	const hasParams = model.supported_parameters?.length;

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
