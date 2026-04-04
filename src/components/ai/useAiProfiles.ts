import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveActiveProfileId } from "../../lib/aiProfiles";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type AiProfile, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";

type AiProfilesBootstrap = {
	profiles: AiProfile[];
	activeProfileId: string | null;
	secretConfigured: boolean | null;
};

let aiProfilesBootstrapCache: AiProfilesBootstrap | null = null;
let aiProfilesBootstrapPromise: Promise<AiProfilesBootstrap> | null = null;

export function clearAiProfilesCache() {
	aiProfilesBootstrapCache = null;
	aiProfilesBootstrapPromise = null;
}

async function fetchAiProfilesBootstrap(): Promise<AiProfilesBootstrap> {
	const [list, active] = await Promise.all([
		invoke("ai_profiles_list"),
		invoke("ai_active_profile_get"),
	]);
	const nextActive = resolveActiveProfileId(list, active);
	if (active !== nextActive && nextActive) {
		await invoke("ai_active_profile_set", { id: nextActive });
	}
	const secretConfigured = nextActive
		? await invoke("ai_secret_status", { profile_id: nextActive }).catch(
				() => null,
			)
		: null;
	return {
		profiles: list,
		activeProfileId: nextActive,
		secretConfigured,
	};
}

export async function preloadAiProfilesData(): Promise<AiProfilesBootstrap> {
	if (aiProfilesBootstrapCache) return aiProfilesBootstrapCache;
	if (!aiProfilesBootstrapPromise) {
		aiProfilesBootstrapPromise = fetchAiProfilesBootstrap()
			.then((data) => {
				aiProfilesBootstrapCache = data;
				return data;
			})
			.finally(() => {
				aiProfilesBootstrapPromise = null;
			});
	}
	return aiProfilesBootstrapPromise;
}

export function useAiProfiles() {
	const [profiles, setProfiles] = useState<AiProfile[]>(
		() => aiProfilesBootstrapCache?.profiles ?? [],
	);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(
		() => aiProfilesBootstrapCache?.activeProfileId ?? null,
	);
	const [secretConfigured, setSecretConfigured] = useState<boolean | null>(
		() => aiProfilesBootstrapCache?.secretConfigured ?? null,
	);
	const [error, setError] = useState("");
	const lastSetRequestIdRef = useRef(0);
	const bootstrapRequestIdRef = useRef(0);
	const secretStatusRequestIdRef = useRef(0);

	const applyBootstrap = useCallback((data: AiProfilesBootstrap) => {
		setProfiles(data.profiles);
		setActiveProfileId(data.activeProfileId);
		setSecretConfigured(data.secretConfigured);
		aiProfilesBootstrapCache = data;
	}, []);

	const reloadProfiles = useCallback(async () => {
		const requestId = ++bootstrapRequestIdRef.current;
		setError("");
		try {
			const data = await fetchAiProfilesBootstrap();
			if (requestId !== bootstrapRequestIdRef.current) return;
			applyBootstrap(data);
		} catch (e) {
			if (requestId !== bootstrapRequestIdRef.current) return;
			setError(extractErrorMessage(e));
		}
	}, [applyBootstrap]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const requestId = ++bootstrapRequestIdRef.current;
			setError("");
			try {
				const data = await preloadAiProfilesData();
				if (cancelled || requestId !== bootstrapRequestIdRef.current) return;
				applyBootstrap(data);
			} catch (e) {
				if (!cancelled && requestId === bootstrapRequestIdRef.current) {
					setError(extractErrorMessage(e));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [applyBootstrap]);

	useTauriEvent("ai:profiles-updated", () => {
		void reloadProfiles();
	});

	useEffect(() => {
		let cancelled = false;
		let unlistenPromise: Promise<() => void> | null = null;
		let focusReloadTimeout: number | null = null;
		try {
			const win = getCurrentWindow();
			unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
				if (!focused || cancelled) return;
				if (focusReloadTimeout != null) {
					window.clearTimeout(focusReloadTimeout);
				}
				focusReloadTimeout = window.setTimeout(() => {
					if (cancelled) return;
					void reloadProfiles();
				}, 400);
			});
		} catch {
			// not running inside tauri window context
		}
		return () => {
			cancelled = true;
			if (focusReloadTimeout != null) {
				window.clearTimeout(focusReloadTimeout);
			}
			void unlistenPromise?.then((unlisten) => unlisten());
		};
	}, [reloadProfiles]);

	useEffect(() => {
		if (!activeProfileId) {
			secretStatusRequestIdRef.current += 1;
			setSecretConfigured(null);
			return;
		}
		if (aiProfilesBootstrapCache?.activeProfileId === activeProfileId) {
			secretStatusRequestIdRef.current += 1;
			setSecretConfigured(aiProfilesBootstrapCache.secretConfigured);
			return;
		}
		let cancelled = false;
		(async () => {
			const requestId = ++secretStatusRequestIdRef.current;
			try {
				const configured = await invoke("ai_secret_status", {
					profile_id: activeProfileId,
				});
				if (!cancelled && requestId === secretStatusRequestIdRef.current) {
					setSecretConfigured(configured);
					aiProfilesBootstrapCache = {
						profiles,
						activeProfileId,
						secretConfigured: configured,
					};
				}
			} catch {
				if (!cancelled && requestId === secretStatusRequestIdRef.current) {
					setSecretConfigured(null);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeProfileId, profiles]);

	const activeProfile = useMemo(() => {
		if (!activeProfileId) return null;
		return profiles.find((p) => p.id === activeProfileId) ?? null;
	}, [activeProfileId, profiles]);

	const setActive = useCallback(
		async (id: string | null) => {
			const previous = activeProfileId;
			const requestId = ++lastSetRequestIdRef.current;
			setActiveProfileId(id);
			setError("");
			try {
				await invoke("ai_active_profile_set", { id });
				aiProfilesBootstrapCache = {
					profiles,
					activeProfileId: id,
					secretConfigured:
						aiProfilesBootstrapCache?.activeProfileId === id
							? aiProfilesBootstrapCache.secretConfigured
							: null,
				};
			} catch (e) {
				if (requestId !== lastSetRequestIdRef.current) return;
				setActiveProfileId(previous);
				setError(extractErrorMessage(e));
			}
		},
		[activeProfileId, profiles],
	);

	const setModel = useCallback(
		async (modelId: string) => {
			const profile = profiles.find((p) => p.id === activeProfileId);
			if (!profile) return;
			const updated = { ...profile, model: modelId };
			setError("");
			try {
				const saved = await invoke("ai_profile_upsert", {
					profile: updated,
				});
				setProfiles((prev) => {
					const next = prev.map((p) => (p.id === saved.id ? saved : p));
					aiProfilesBootstrapCache = {
						profiles: next,
						activeProfileId,
						secretConfigured,
					};
					return next;
				});
			} catch (e) {
				setError(extractErrorMessage(e));
			}
		},
		[activeProfileId, profiles, secretConfigured],
	);

	return {
		profiles,
		activeProfileId,
		activeProfile,
		setActive,
		setModel,
		secretConfigured,
		error,
	};
}
