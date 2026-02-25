import { useCallback, useEffect, useMemo, useState } from "react";
import { loadSettings, setAiEnabled } from "../../lib/settings";
import { type AiProfile, invoke } from "../../lib/tauri";
import { AiProfileSections } from "./ai/AiProfileSections";
import { errMessage } from "./ai/utils";

export function AiSettingsPane() {
	const [aiEnabled, setAiEnabledState] = useState(true);
	const [profiles, setProfiles] = useState<AiProfile[]>([]);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [error, setError] = useState("");

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
				const id = active ?? list[0]?.id ?? null;
				setActiveProfileId(id);
				if (!active && list[0]?.id) {
					await invoke("ai_active_profile_set", { id: list[0].id });
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

	const createDefaultProfile = useCallback(async () => {
		setError("");
		try {
			const created = await invoke("ai_profile_upsert", {
				profile: {
					id: "",
					name: "Default",
					provider: "openai",
					model: "",
					base_url: null,
					headers: [],
					allow_private_hosts: false,
					reasoning_effort: null,
				},
			});
			setProfiles((prev) => [...prev, created]);
			setActiveProfileId(created.id);
			await invoke("ai_active_profile_set", { id: created.id });
		} catch (e) {
			setError(errMessage(e));
		}
	}, []);

	const saveProfile = useCallback(async (draft: AiProfile) => {
		setError("");
		try {
			const saved = await invoke("ai_profile_upsert", {
				profile: draft,
			});
			setProfiles((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
			setActiveProfileId(saved.id);
		} catch (e) {
			setError(errMessage(e));
		}
	}, []);

	const onActiveProfileChange = useCallback(async (id: string | null) => {
		setActiveProfileId(id);
		await invoke("ai_active_profile_set", { id });
	}, []);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">AI Availability</div>
							<div className="settingsCardHint">
								Turn AI tools on or off across Glyph.
							</div>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">AI Features</div>
						</div>
						<select
							aria-label="Enable AI"
							value={aiEnabled ? "enabled" : "disabled"}
							onChange={(event) =>
								void updateAiEnabled(event.target.value === "enabled")
							}
						>
							<option value="enabled">On</option>
							<option value="disabled">Off</option>
						</select>
					</div>
					<p className="settingsHint">
						When off, AI panels and AI command-palette actions stay hidden.
					</p>
				</section>

				<AiProfileSections
					key={activeProfileId ?? "none"}
					profiles={profiles}
					activeProfileId={activeProfileId}
					activeProfile={activeProfile}
					onActiveProfileChange={onActiveProfileChange}
					onCreateProfile={() => void createDefaultProfile()}
					onSaveProfile={saveProfile}
				/>
			</div>
		</div>
	);
}
