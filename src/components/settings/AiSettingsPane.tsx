import { emitTo } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveActiveProfileId } from "../../lib/aiProfiles";
import { isMissingFileError } from "../../lib/fsErrors";
import { loadSettings, setAiEnabled } from "../../lib/settings";
import { type AiProfile, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { AiProfileSections } from "./ai/AiProfileSections";
import { errMessage } from "./ai/utils";

const MISSING_FILE_RETRY_DELAY_MS = 80;
const IS_DEV = import.meta.env.DEV;

async function setActiveProfileWithRetry(id: string | null) {
	try {
		await invoke("ai_active_profile_set", { id });
	} catch (error) {
		if (!isMissingFileError(error)) throw error;
		if (IS_DEV) {
			console.debug(
				"[AiSettingsPane] ai_active_profile_set failed with missing-file error; retrying.",
				error,
			);
		}
		await new Promise((resolve) =>
			window.setTimeout(resolve, MISSING_FILE_RETRY_DELAY_MS),
		);
		try {
			await invoke("ai_active_profile_set", { id });
		} catch (retryError) {
			if (!isMissingFileError(retryError)) throw retryError;
			if (IS_DEV) {
				console.warn(
					"[AiSettingsPane] ai_active_profile_set retry also failed with missing-file error.",
					retryError,
				);
			}
			throw retryError;
		}
	}
}

export function AiSettingsPane() {
	const [aiEnabled, setAiEnabledState] = useState(true);
	const [profiles, setProfiles] = useState<AiProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const activeProfileIdRef = useRef<string | null>(null);
	const pendingActiveProfileIdRef = useRef<string | null>(null);
	const saveProfileRequestIdRef = useRef(0);
	const activeProfileChangeRequestIdRef = useRef(0);
	const reloadProfilesRequestIdRef = useRef(0);

	const setActiveProfileIdTracked = useCallback((id: string | null) => {
		activeProfileIdRef.current = id;
		setActiveProfileId(id);
	}, []);

	const notifyAiProfilesUpdated = useCallback(async () => {
		await emitTo("main", "ai:profiles-updated");
	}, []);

	const activeProfile = useMemo(() => {
		if (!activeProfileId) return null;
		return profiles.find((p) => p.id === activeProfileId) ?? null;
	}, [activeProfileId, profiles]);

	const reloadProfiles = useCallback(async () => {
		const requestId = ++reloadProfilesRequestIdRef.current;
		setError("");
		try {
			const settings = await loadSettings();
			if (requestId !== reloadProfilesRequestIdRef.current) return;
			setAiEnabledState(settings.ui.aiEnabled);
			const [list, active] = await Promise.all([
				invoke("ai_profiles_list"),
				invoke("ai_active_profile_get"),
			]);
			if (requestId !== reloadProfilesRequestIdRef.current) return;
			setProfiles(list);
			const pendingId = pendingActiveProfileIdRef.current;
			const pendingStillValid =
				pendingId != null && list.some((profile) => profile.id === pendingId);
			if (pendingStillValid) {
				// A provider switch is in flight — keep the pending selection.
				return;
			}
			const id = resolveActiveProfileId(list, active);
			setActiveProfileIdTracked(id);
			if (active !== id && id) {
				await invoke("ai_active_profile_set", { id });
			}
		} catch (e) {
			if (requestId !== reloadProfilesRequestIdRef.current) return;
			setError(errMessage(e));
		}
	}, [setActiveProfileIdTracked]);

	useEffect(() => {
		void reloadProfiles();
	}, [reloadProfiles]);

	useTauriEvent("ai:profiles-updated", () => {
		void reloadProfiles();
	});

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
				setProfiles((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
				if (activeProfileIdRef.current === saved.id) {
					await setActiveProfileWithRetry(saved.id);
					if (requestId !== saveProfileRequestIdRef.current) return;
					setActiveProfileIdTracked(saved.id);
				}
				await notifyAiProfilesUpdated();
			} catch (e) {
				if (requestId !== saveProfileRequestIdRef.current) return;
				setError(errMessage(e));
			}
		},
		[notifyAiProfilesUpdated, setActiveProfileIdTracked],
	);

	const onActiveProfileChange = useCallback(
		async (id: string | null) => {
			const previous = activeProfileIdRef.current;
			const requestId = ++activeProfileChangeRequestIdRef.current;
			pendingActiveProfileIdRef.current = id;
			setActiveProfileIdTracked(id);
			setError("");
			try {
				await setActiveProfileWithRetry(id);
				if (requestId !== activeProfileChangeRequestIdRef.current) return;
				await notifyAiProfilesUpdated();
				if (requestId !== activeProfileChangeRequestIdRef.current) return;
				if (pendingActiveProfileIdRef.current === id) {
					pendingActiveProfileIdRef.current = null;
				}
			} catch (e) {
				if (requestId !== activeProfileChangeRequestIdRef.current) return;
				pendingActiveProfileIdRef.current = null;
				setActiveProfileIdTracked(previous);
				setError(errMessage(e));
			}
		},
		[notifyAiProfilesUpdated, setActiveProfileIdTracked],
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
