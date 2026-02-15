import { useCallback, useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type AiProfile, invoke } from "../../lib/tauri";

export function useAiProfiles() {
	const [profiles, setProfiles] = useState<AiProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [secretConfigured, setSecretConfigured] = useState<boolean | null>(
		null,
	);
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setError("");
			try {
				const [list, active] = await Promise.all([
					invoke("ai_profiles_list"),
					invoke("ai_active_profile_get"),
				]);
				if (cancelled) return;
				setProfiles(list);
				const nextActive = active ?? list[0]?.id ?? null;
				setActiveProfileId(nextActive);
				if (!active && list[0]?.id) {
					await invoke("ai_active_profile_set", { id: list[0].id });
				}
			} catch (e) {
				if (!cancelled) setError(extractErrorMessage(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!activeProfileId) {
			setSecretConfigured(null);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const configured = await invoke("ai_secret_status", {
					profile_id: activeProfileId,
				});
				if (!cancelled) setSecretConfigured(configured);
			} catch {
				if (!cancelled) setSecretConfigured(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeProfileId]);

	const activeProfile = useMemo(() => {
		if (!activeProfileId) return null;
		return profiles.find((p) => p.id === activeProfileId) ?? null;
	}, [activeProfileId, profiles]);

	const setActive = useCallback(async (id: string | null) => {
		setActiveProfileId(id);
		setError("");
		try {
			await invoke("ai_active_profile_set", { id });
		} catch (e) {
			setError(extractErrorMessage(e));
		}
	}, []);

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
				setProfiles((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
			} catch (e) {
				setError(extractErrorMessage(e));
			}
		},
		[activeProfileId, profiles],
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
