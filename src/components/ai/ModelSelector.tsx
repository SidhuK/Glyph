import {
	type KeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import anthropicLogoUrl from "../../assets/provider-logos/claude-ai.svg?url";
import geminiLogoUrl from "../../assets/provider-logos/google-gemini.svg?url";
import ollamaLogoUrl from "../../assets/provider-logos/ollama.svg?url";
import openrouterLogoUrl from "../../assets/provider-logos/open-router.svg?url";
import openaiLogoUrl from "../../assets/provider-logos/openai-light.svg?url";
import {
	type AiModel,
	type AiProfile,
	type AiProviderKind,
	type ProviderSupportEntry,
	invoke,
} from "../../lib/tauri";
import { ChevronDown, InformationCircle } from "../Icons";
import styles from "./ModelSelector.module.css";

const providerLogoMap: Record<AiProviderKind, { src: string; label: string }> =
	{
		openai: {
			src: openaiLogoUrl,
			label: "OpenAI",
		},
		openai_compat: {
			src: openaiLogoUrl,
			label: "OpenAI (compat)",
		},
		openrouter: {
			src: openrouterLogoUrl,
			label: "OpenRouter",
		},
		anthropic: {
			src: anthropicLogoUrl,
			label: "Anthropic",
		},
		gemini: {
			src: geminiLogoUrl,
			label: "Google Gemini",
		},
		ollama: {
			src: ollamaLogoUrl,
			label: "Ollama",
		},
	};

const ProviderLogo = ({
	provider,
	className,
}: {
	provider: AiProviderKind | null;
	className?: string;
}) => {
	if (!provider) return null;
	const config = providerLogoMap[provider];
	if (!config) return null;
	return (
		<img
			src={config.src}
			alt={`${config.label} logo`}
			className={className}
			draggable={false}
		/>
	);
};

const openRouterProviderHints: Array<{
	kind: AiProviderKind;
	keywords: string[];
}> = [
	{ kind: "openai", keywords: ["openai"] },
	{ kind: "anthropic", keywords: ["anthropic", "claude"] },
	{ kind: "gemini", keywords: ["gemini", "google"] },
	{ kind: "ollama", keywords: ["ollama"] },
];

function guessOpenRouterProvider(modelName: string): AiProviderKind | null {
	const normalized = modelName.toLowerCase();
	for (const hint of openRouterProviderHints) {
		if (hint.keywords.some((keyword) => normalized.includes(keyword))) {
			return hint.kind;
		}
	}
	return null;
}

function resolveLogoProvider(
	provider: AiProviderKind | null,
	modelName: string | undefined,
): AiProviderKind | null {
	if (provider !== "openrouter" || !modelName?.trim()) {
		return provider;
	}
	return guessOpenRouterProvider(modelName) ?? provider;
}

const providerSupportKeyMap: Record<AiProviderKind, string> = {
	openai: "openai",
	openai_compat: "openai_like",
	openrouter: "openrouter",
	anthropic: "anthropic",
	gemini: "gemini",
	ollama: "ollama",
};

const endpointLabelMap: Record<string, string> = {
	chat_completions: "Chat completions",
	messages: "Messages",
	responses: "Responses",
	embeddings: "Embeddings",
	image_generations: "Image generation",
	image_variations: "Image variations",
	image_edits: "Image edits",
	audio_transcriptions: "Audio transcription",
	audio_speech: "Text to speech",
	moderations: "Moderations",
	batches: "Batches",
	rerank: "Re-rank",
	a2a: "Agent-to-agent",
	interactions: "Google Interactions",
	vector_store_files: "Vector store files",
	vector_stores_create: "Vector store create",
	vector_stores_search: "Vector store search",
	assistants: "Assistants",
	container: "Containers",
	container_files: "Container files",
	fine_tuning: "Fine tuning",
	search: "Search",
	realtime: "Realtime",
	text_completion: "Text completion",
	compact: "Compact responses",
};

function formatEndpointLabel(endpoint: string) {
	return endpointLabelMap[endpoint] ?? endpoint.replace(/_/g, " ");
}

interface ModelSelectorProps {
	profileId: string | null;
	value: string;
	onChange: (modelId: string) => void;
	provider: AiProviderKind | null;
	profiles: AiProfile[];
	activeProfileId: string | null;
	onProfileChange: (id: string | null) => void;
}

export function ModelSelector({
	profileId,
	value,
	onChange,
	provider,
	profiles,
	activeProfileId,
	onProfileChange,
}: ModelSelectorProps) {
	const [open, setOpen] = useState(false);
	const [models, setModels] = useState<AiModel[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [detailModelId, setDetailModelId] = useState<string | null>(null);
	const [modelQuery, setModelQuery] = useState("");
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [dropdownPos, setDropdownPos] = useState<{
		bottom: number;
		right: number;
	} | null>(null);
	const [providerSupportMap, setProviderSupportMap] = useState<Record<
		string,
		ProviderSupportEntry
	> | null>(null);
	const [secretProfileIds, setSecretProfileIds] = useState<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset cache when profile changes
	useEffect(() => {
		setModels(null);
		setError("");
	}, [profileId]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const result = await invoke("ai_provider_support");
				if (!cancelled) {
					setProviderSupportMap(result.providers);
				}
			} catch {
				if (!cancelled) {
					setProviderSupportMap(null);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

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
		const handleClick = (e: globalThis.MouseEvent) => {
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

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		void (async () => {
			try {
				const ids = await invoke("ai_secret_list");
				if (!cancelled) {
					setSecretProfileIds(ids);
				}
			} catch {
				if (!cancelled) {
					setSecretProfileIds([]);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		void fetchModels();
	}, [open, fetchModels]);

	useEffect(() => {
		if (!open) return;
		setModelQuery("");
	}, [open]);

	const selectedModel = models?.find((m) => m.id === value);
	const displayLabel = selectedModel?.name ?? value ?? "Model";
	const detailModel = detailModelId
		? (models?.find((m) => m.id === detailModelId) ?? null)
		: null;
	const truncateLabel = (name: string) => {
		if (name.length <= 30) return name;
		return `${name.slice(0, 27)}…`;
	};

	const secretProfileSet = useMemo(
		() => new Set(secretProfileIds),
		[secretProfileIds],
	);
	const configuredProfiles = useMemo(() => {
		return profiles
			.filter((profile) => secretProfileSet.has(profile.id))
			.map((profile) => {
				const resolvedProvider =
					resolveLogoProvider(profile.provider, profile.model) ??
					profile.provider;
				return {
					id: profile.id,
					name: profile.name || resolvedProvider,
					logoProvider: resolvedProvider,
					providerLabel:
						providerLogoMap[resolvedProvider]?.label ?? profile.provider,
				};
			});
	}, [profiles, secretProfileSet]);

	const showProfileSwitcher = configuredProfiles.length > 1;
	const filteredModels = useMemo(() => {
		const list = models ?? [];
		const q = modelQuery.trim().toLowerCase();
		if (!q) return list;
		return list.filter((m) => {
			const id = m.id.toLowerCase();
			const name = m.name.toLowerCase();
			return id.includes(q) || name.includes(q);
		});
	}, [models, modelQuery]);

	const handleProfileSelect = useCallback(
		(id: string) => {
			if (id === activeProfileId) return;
			setModels(null);
			setError("");
			setDetailModelId(null);
			void onProfileChange(id);
		},
		[activeProfileId, onProfileChange],
	);

	const logoProvider = useMemo(
		() => resolveLogoProvider(provider, selectedModel?.name),
		[provider, selectedModel?.name],
	);

	const detailProviderKind = logoProvider ?? provider;
	const detailProviderKey = detailProviderKind
		? providerSupportKeyMap[detailProviderKind]
		: undefined;
	const detailProviderSupport =
		detailProviderKey && providerSupportMap
			? providerSupportMap[detailProviderKey]
			: undefined;

	const providerTitle = logoProvider
		? (providerLogoMap[logoProvider]?.label ?? logoProvider)
		: provider
			? (providerLogoMap[provider]?.label ?? provider)
			: "Model provider";

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				className={styles.trigger}
				onClick={() => (open ? setOpen(false) : handleOpen())}
				title={value || "Select model"}
			>
				{logoProvider && (
					<span className={styles.triggerLogo} title={providerTitle}>
						<ProviderLogo
							provider={logoProvider}
							className={styles.providerSvg}
						/>
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
							{logoProvider && (
								<span className={styles.providerIcon} title={providerTitle}>
									<ProviderLogo
										provider={logoProvider}
										className={styles.providerSvg}
									/>
								</span>
							)}
							<span className={styles.dropdownTitle}>Models</span>
							{models && (
								<span className={styles.dropdownCount}>{models.length}</span>
							)}
						</div>

						<div className={styles.dropdownBody}>
							<div className={styles.dropdownList}>
								{showProfileSwitcher && (
									<div className={styles.profileSwitcher}>
										<span className={styles.profileSwitcherTitle}>
											API keys
										</span>
										<div className={styles.profilePills}>
											{configuredProfiles.map((profile) => (
												<button
													key={profile.id}
													type="button"
													className={`${styles.profilePill} ${
														profile.id === activeProfileId
															? styles.profilePillActive
															: ""
													}`}
													onClick={() => handleProfileSelect(profile.id)}
													title={profile.providerLabel}
													aria-pressed={profile.id === activeProfileId}
												>
													<ProviderLogo
														provider={profile.logoProvider}
														className={styles.profilePillLogo}
													/>
													<span className={styles.profilePillName}>
														{profile.name}
													</span>
												</button>
											))}
										</div>
									</div>
								)}
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
								{!loading && !error && (models?.length ?? 0) > 0 && (
									<input
										type="search"
										className={styles.modelSearch}
										placeholder="Search models..."
										value={modelQuery}
										onChange={(e) => setModelQuery(e.target.value)}
									/>
								)}
								{!loading &&
									!error &&
									models &&
									models.length > 0 &&
									filteredModels.length === 0 && (
										<div className={styles.dropdownEmpty}>
											No models match your search
										</div>
									)}

								{!loading &&
									!error &&
									filteredModels.map((m) => {
										const detailAvailable = hasDetailData(m);
										const infoActive = detailModel?.id === m.id;
										const handleInfoToggle = () => {
											setDetailModelId((prev) => (prev === m.id ? null : m.id));
										};
										const handleInfoClick = (
											event: ReactMouseEvent<HTMLButtonElement>,
										) => {
											event.stopPropagation();
											handleInfoToggle();
										};
										const handleInfoKeyDown = (
											event: KeyboardEvent<HTMLButtonElement>,
										) => {
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
													<button
														type="button"
														onClick={handleInfoClick}
														onKeyDown={handleInfoKeyDown}
														className={`${styles.infoInline} ${
															infoActive ? styles.infoInlineActive : ""
														}`}
														title="Model info"
														aria-pressed={infoActive}
														aria-label="Model info"
													>
														<InformationCircle size={14} />
													</button>
												)}
											</button>
										);
									})}
							</div>

							{detailModel && (
								<ModelDetail
									model={detailModel}
									providerSupport={detailProviderSupport}
								/>
							)}
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

function ModelDetail({
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
