import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import {
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import type { AiModel, AiProviderKind } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";

import { ChevronDown } from "../Icons";
import { ModelDetail, hasDetailData } from "./ModelDetail";
import styles from "./ModelSelector.module.css";
import {
	ProviderLogo,
	providerLogoMap,
	providerSupportKeyMap,
	resolveLogoProvider,
	truncateLabel,
} from "./modelSelectorConstants";

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
	const [detailModelId, setDetailModelId] = useState<string | null>(null);
	const [modelQuery, setModelQuery] = useState("");
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [dropdownPos, setDropdownPos] = useState<{
		bottom: number;
		right: number;
	} | null>(null);
	const providerSupportQuery = useQuery({
		queryKey: ["ai", "provider-support"],
		queryFn: async () => {
			const result = await invoke("ai_provider_support");
			return result.providers;
		},
		staleTime: 24 * 60 * 60 * 1000,
	});
	const modelsQuery = useQuery({
		queryKey: ["ai", "models", profileId, provider],
		queryFn: () => {
			if (!profileId) return Promise.resolve([] as AiModel[]);
			return invoke("ai_models_list", { profile_id: profileId });
		},
		enabled: open && Boolean(profileId),
	});
	const models = modelsQuery.data ?? null;
	const error = modelsQuery.error
		? modelsQuery.error instanceof Error
			? modelsQuery.error.message
			: String(modelsQuery.error)
		: "";

	const handleOpen = useCallback(() => {
		setOpen(true);
		setDetailModelId(null);
		setModelQuery("");
	}, []);
	const handleClose = useCallback(() => {
		setOpen(false);
		setDetailModelId(null);
		setModelQuery("");
	}, []);
	const handleRetry = useCallback(() => {
		void modelsQuery.refetch();
	}, [modelsQuery]);

	useLayoutEffect(() => {
		if (!open || !triggerRef.current) return;
		const r = triggerRef.current.getBoundingClientRect();
		setDropdownPos({
			bottom: window.innerHeight - r.top + 8,
			right: window.innerWidth - r.right,
		});
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const handleClick = (e: globalThis.MouseEvent) => {
			const t = e.target as Node;
			if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t))
				return;
			handleClose();
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open, handleClose]);

	const selectedModel = models?.find((m) => m.id === value);
	const displayLabel = selectedModel?.name ?? value ?? "Model";
	const detailModel = detailModelId
		? (models?.find((m) => m.id === detailModelId) ?? null)
		: null;
	const filteredModels = useMemo(() => {
		const list = models ?? [];
		const q = modelQuery.trim().toLowerCase();
		if (!q) return list;
		return list.filter(
			(m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
		);
	}, [models, modelQuery]);

	const logoProvider = useMemo(
		() => resolveLogoProvider(provider, selectedModel?.name),
		[provider, selectedModel?.name],
	);
	const detailProviderKind = logoProvider ?? provider;
	const detailProviderKey = detailProviderKind
		? providerSupportKeyMap[detailProviderKind]
		: undefined;
	const detailProviderSupport =
		detailProviderKey && providerSupportQuery.data
			? providerSupportQuery.data[detailProviderKey]
			: undefined;
	const listProviderKey = provider
		? providerSupportKeyMap[provider]
		: undefined;
	const listProviderSupport =
		listProviderKey && providerSupportQuery.data
			? providerSupportQuery.data[listProviderKey]
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
				onClick={() => (open ? handleClose() : handleOpen())}
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
					<ChevronDown size="var(--icon-sm)" />
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
								{!error && models?.length === 0 && (
									<div className={styles.dropdownEmpty}>
										No models available
									</div>
								)}
								{!error && (models?.length ?? 0) > 0 && (
									<input
										type="search"
										className={styles.modelSearch}
										placeholder="Search models..."
										value={modelQuery}
										onChange={(e) => setModelQuery(e.target.value)}
									/>
								)}
								{!error &&
									models &&
									models.length > 0 &&
									filteredModels.length === 0 && (
										<div className={styles.dropdownEmpty}>
											No models match your search
										</div>
									)}
								{!error &&
									filteredModels.map((m) => {
										const detailAvailable = hasDetailData(
											m,
											listProviderSupport,
										);
										const infoActive = detailModel?.id === m.id;
										const handleInfoToggle = () =>
											setDetailModelId((prev) => (prev === m.id ? null : m.id));
										const handleInfoMouseDown = (
											e: ReactMouseEvent<HTMLButtonElement>,
										) => {
											e.preventDefault();
											e.stopPropagation();
										};
										const handleInfoClick = (
											e: ReactMouseEvent<HTMLButtonElement>,
										) => {
											e.preventDefault();
											e.stopPropagation();
											handleInfoToggle();
										};
										const infoLabel = infoActive
											? "Hide model details"
											: "Show model details";
										return (
											<div className={styles.modelItemRow} key={m.id}>
												<button
													type="button"
													className={`${styles.modelItem} ${m.id === value ? styles.modelItemActive : ""}`}
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
												</button>
												{detailAvailable && (
													<button
														type="button"
														onMouseDown={handleInfoMouseDown}
														onClick={handleInfoClick}
														className={`${styles.infoInline} ${infoActive ? styles.infoInlineActive : ""}`}
														title={infoLabel}
														aria-label={infoLabel}
														aria-pressed={infoActive}
													>
														<HugeiconsIcon
															icon={InformationCircleIcon}
															size="var(--icon-md)"
															strokeWidth={0.9}
														/>
													</button>
												)}
											</div>
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
