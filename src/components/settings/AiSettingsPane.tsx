import { emit, emitTo } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveActiveProfileId } from "../../lib/aiProfiles";
import { loadSettings, setAiEnabled } from "../../lib/settings";
import { type AiProfile, invoke } from "../../lib/tauri";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { AiProfileSections } from "./ai/AiProfileSections";
import { errMessage } from "./ai/utils";

export function AiSettingsPane() {
	const [aiEnabled, setAiEnabledState] = useState(true);
	const [profiles, setProfiles] = useState<AiProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const saveProfileRequestIdRef = useRef(0);
	const activeProfileChangeRequestIdRef = useRef(0);

	const notifyAiProfilesUpdated = useCallback(async () => {
		await Promise.allSettled([
			emit("ai:profiles-updated"),
			emitTo("main", "ai:profiles-updated"),
			emitTo("settings", "ai:profiles-updated"),
		]);
	}, []);

	const activeProfile = useMemo(() => {
		if (!activeProfileId) return null;
		return profiles.find((p) => p.id === activeProfileId) ?? null;
	}, [activeProfileId, profiles]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setError("");
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setAiEnabledState(settings.ui.aiEnabled);
				const [list, active] = await Promise.all([
					invoke("ai_profiles_list"),
					invoke("ai_active_profile_get"),
				]);
				if (cancelled) return;
				setProfiles(list);
				const id = resolveActiveProfileId(list, active);
				setActiveProfileId(id);
				if (active !== id && id) {
					await invoke("ai_active_profile_set", { id });
				}
			} catch (e) {
				if (!cancelled) setError(errMessage(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const updateAiEnabled = useCallback(async (enabled: boolean) => {
		setError("");
		setAiEnabledState(enabled);
		try {
			await setAiEnabled(enabled);
		} catch (e) {
			setError(errMessage(e));
		}
	}, []);

	const saveProfile = useCallback(
		async (draft: AiProfile) => {
			const requestId = ++saveProfileRequestIdRef.current;
			setError("");
			try {
				const saved = await invoke("ai_profile_upsert", {
					profile: draft,
				});
				if (requestId !== saveProfileRequestIdRef.current) return;
				await invoke("ai_active_profile_set", { id: saved.id });
				if (requestId !== saveProfileRequestIdRef.current) return;
				setProfiles((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
				setActiveProfileId(saved.id);
				await notifyAiProfilesUpdated();
			} catch (e) {
				if (requestId !== saveProfileRequestIdRef.current) return;
				setError(errMessage(e));
			}
		},
		[notifyAiProfilesUpdated],
	);

	const onActiveProfileChange = useCallback(
		async (id: string | null) => {
			const previous = activeProfileId;
			const requestId = ++activeProfileChangeRequestIdRef.current;
			setActiveProfileId(id);
			setError("");
			try {
				await invoke("ai_active_profile_set", { id });
				await notifyAiProfilesUpdated();
			} catch (e) {
				if (requestId !== activeProfileChangeRequestIdRef.current) return;
				setActiveProfileId(previous);
				setError(errMessage(e));
			}
		},
		[activeProfileId, notifyAiProfilesUpdated],
	);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title="Availability"
					description="Turn AI tools on or off across Glyph."
				>
					<SettingsRow
						label="AI features"
						description="When off, AI panels and AI command-palette actions stay hidden."
					>
						<SettingsToggle
							ariaLabel="AI features"
							checked={aiEnabled}
							onCheckedChange={(checked) => void updateAiEnabled(checked)}
						/>
					</SettingsRow>
					{!aiEnabled ? (
						<SettingsRow
							label="Configuration"
							description="Turn AI back on to manage providers, models, and account access."
							stacked
							interactive={false}
						>
							<div className="settingsEmpty">
								AI configuration stays hidden until AI features are enabled.
							</div>
						</SettingsRow>
					) : null}
				</SettingsSection>

				{aiEnabled ? (
					<AiProfileSections
						profiles={profiles}
						activeProfileId={activeProfileId}
						activeProfile={activeProfile}
						onActiveProfileChange={onActiveProfileChange}
						onSaveProfile={saveProfile}
					/>
				) : null}
			</div>
		</div>
	);
}
