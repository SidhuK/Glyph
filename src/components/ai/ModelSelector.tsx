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
import type { AiModel, AiProfile, AiProviderKind, ProviderSupportEntry } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { ChevronDown, InformationCircle } from "../Icons";
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
	const [dropdownPos, setDropdownPos] = useState<{ bottom: number; right: number } | null>(null);
	const [providerSupportMap, setProviderSupportMap] = useState<Record<string, ProviderSupportEntry> | null>(null);
	const [secretProfileIds, setSecretProfileIds] = useState<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset cache when profile changes
	useEffect(() => { setModels(null); setError(""); }, [profileId]);

	useEffect(() => {
		let cancelled = false;
		void (async () => { try { const r = await invoke("ai_provider_support"); if (!cancelled) setProviderSupportMap(r.providers); } catch { if (!cancelled) setProviderSupportMap(null); } })();
		return () => { cancelled = true; };
	}, []);

	const fetchModels = useCallback(async () => {
		if (!profileId || models || loading) return;
		setLoading(true);
		setError("");
		try { setModels(await invoke("ai_models_list", { profile_id: profileId })); }
		catch (e) { setError(e instanceof Error ? e.message : String(e)); }
		finally { setLoading(false); }
	}, [profileId, models, loading]);

	const handleOpen = useCallback(() => { setOpen(true); setDetailModelId(null); void fetchModels(); }, [fetchModels]);
	const handleRetry = useCallback(() => {
		setModels(null); setError("");
		void (async () => { if (!profileId) return; setLoading(true); try { setModels(await invoke("ai_models_list", { profile_id: profileId })); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); } })();
	}, [profileId]);

	useLayoutEffect(() => { if (!open || !triggerRef.current) return; const r = triggerRef.current.getBoundingClientRect(); setDropdownPos({ bottom: window.innerHeight - r.top + 8, right: window.innerWidth - r.right }); }, [open]);

	useEffect(() => {
		if (!open) return;
		const handleClick = (e: globalThis.MouseEvent) => { const t = e.target as Node; if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return; setOpen(false); setDetailModelId(null); };
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	useEffect(() => { if (!open) return; let c = false; void (async () => { try { const ids = await invoke("ai_secret_list"); if (!c) setSecretProfileIds(ids); } catch { if (!c) setSecretProfileIds([]); } })(); return () => { c = true; }; }, [open]);
	useEffect(() => { if (open) void fetchModels(); }, [open, fetchModels]);
	useEffect(() => { if (open) setModelQuery(""); }, [open]);

	const selectedModel = models?.find((m) => m.id === value);
	const displayLabel = selectedModel?.name ?? value ?? "Model";
	const detailModel = detailModelId ? (models?.find((m) => m.id === detailModelId) ?? null) : null;

	const secretProfileSet = useMemo(() => new Set(secretProfileIds), [secretProfileIds]);
	const configuredProfiles = useMemo(() => profiles.filter((p) => secretProfileSet.has(p.id)).map((p) => {
		const resolved = resolveLogoProvider(p.provider, p.model) ?? p.provider;
		return { id: p.id, name: p.name || resolved, logoProvider: resolved, providerLabel: providerLogoMap[resolved]?.label ?? p.provider };
	}), [profiles, secretProfileSet]);

	const showProfileSwitcher = configuredProfiles.length > 1;
	const filteredModels = useMemo(() => { const list = models ?? []; const q = modelQuery.trim().toLowerCase(); if (!q) return list; return list.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)); }, [models, modelQuery]);

	const handleProfileSelect = useCallback((id: string) => { if (id === activeProfileId) return; setModels(null); setError(""); setDetailModelId(null); void onProfileChange(id); }, [activeProfileId, onProfileChange]);

	const logoProvider = useMemo(() => resolveLogoProvider(provider, selectedModel?.name), [provider, selectedModel?.name]);
	const detailProviderKind = logoProvider ?? provider;
	const detailProviderKey = detailProviderKind ? providerSupportKeyMap[detailProviderKind] : undefined;
	const detailProviderSupport = detailProviderKey && providerSupportMap ? providerSupportMap[detailProviderKey] : undefined;
	const providerTitle = logoProvider ? (providerLogoMap[logoProvider]?.label ?? logoProvider) : provider ? (providerLogoMap[provider]?.label ?? provider) : "Model provider";

	return (
		<>
			<button ref={triggerRef} type="button" className={styles.trigger} onClick={() => (open ? setOpen(false) : handleOpen())} title={value || "Select model"}>
				{logoProvider && <span className={styles.triggerLogo} title={providerTitle}><ProviderLogo provider={logoProvider} className={styles.providerSvg} /></span>}
				<span className={styles.triggerLabel}>{displayLabel}</span>
				<span className={`${styles.triggerIcon} ${open ? styles.triggerIconOpen : ""}`}><ChevronDown size={12} /></span>
			</button>

			{open && dropdownPos && createPortal(
				<div ref={dropdownRef} className={styles.dropdown} style={{ position: "fixed", bottom: dropdownPos.bottom, right: dropdownPos.right }}>
					<div className={styles.dropdownHeader}>
						{logoProvider && <span className={styles.providerIcon} title={providerTitle}><ProviderLogo provider={logoProvider} className={styles.providerSvg} /></span>}
						<span className={styles.dropdownTitle}>Models</span>
						{models && <span className={styles.dropdownCount}>{models.length}</span>}
					</div>
					<div className={styles.dropdownBody}>
						<div className={styles.dropdownList}>
							{showProfileSwitcher && (
								<div className={styles.profileSwitcher}>
									<span className={styles.profileSwitcherTitle}>API keys</span>
									<div className={styles.profilePills}>
										{configuredProfiles.map((p) => (
											<button key={p.id} type="button" className={`${styles.profilePill} ${p.id === activeProfileId ? styles.profilePillActive : ""}`} onClick={() => handleProfileSelect(p.id)} title={p.providerLabel} aria-pressed={p.id === activeProfileId}>
												<ProviderLogo provider={p.logoProvider} className={styles.profilePillLogo} />
												<span className={styles.profilePillName}>{p.name}</span>
											</button>
										))}
									</div>
								</div>
							)}
							{loading && <div className={styles.dropdownLoading}>Loading models…</div>}
							{error && <div className={styles.dropdownError}>{error}<br /><button type="button" className={styles.retryBtn} onClick={handleRetry}>Retry</button></div>}
							{!loading && !error && models?.length === 0 && <div className={styles.dropdownEmpty}>No models available</div>}
							{!loading && !error && (models?.length ?? 0) > 0 && <input type="search" className={styles.modelSearch} placeholder="Search models..." value={modelQuery} onChange={(e) => setModelQuery(e.target.value)} />}
							{!loading && !error && models && models.length > 0 && filteredModels.length === 0 && <div className={styles.dropdownEmpty}>No models match your search</div>}
							{!loading && !error && filteredModels.map((m) => {
								const detailAvailable = hasDetailData(m);
								const infoActive = detailModel?.id === m.id;
								const handleInfoToggle = () => setDetailModelId((prev) => (prev === m.id ? null : m.id));
								const handleInfoClick = (e: ReactMouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleInfoToggle(); };
								const handleInfoKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); handleInfoToggle(); } };
								return (
									<button type="button" key={m.id} className={`${styles.modelItem} ${m.id === value ? styles.modelItemActive : ""}`} onClick={() => { onChange(m.id); setOpen(false); setDetailModelId(null); }}>
										<span className={styles.modelItemText} title={m.name.length > 30 ? m.name : undefined}>{truncateLabel(m.name)}</span>
										{detailAvailable && <button type="button" onClick={handleInfoClick} onKeyDown={handleInfoKeyDown} className={`${styles.infoInline} ${infoActive ? styles.infoInlineActive : ""}`} title="Model info" aria-pressed={infoActive} aria-label="Model info"><InformationCircle size={14} /></button>}
									</button>
								);
							})}
						</div>
						{detailModel && <ModelDetail model={detailModel} providerSupport={detailProviderSupport} />}
					</div>
				</div>,
				document.body,
			)}
		</>
	);
}
