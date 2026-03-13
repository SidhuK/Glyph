import { useCallback, useMemo, useRef, useState } from "react";
import type { AiModel, AiProfile } from "../../../lib/tauri";
import { AiActiveProfileSection } from "./AiActiveProfileSection";
import { AiApiKeySection } from "./AiApiKeySection";
import { AiCodexAccountSection } from "./AiCodexAccountSection";
import { AiProviderSection } from "./AiProviderSection";
import { useApiKeySettings } from "./useApiKeySettings";
import { useCodexAccount } from "./useCodexAccount";

interface AiProfileSectionsProps {
	profiles: AiProfile[];
	activeProfileId: string | null;
	activeProfile: AiProfile | null;
	onActiveProfileChange: (id: string | null) => Promise<void>;
	onCreateProfile: () => void;
	onSaveProfile: (draft: AiProfile) => Promise<void>;
	visibleSections?: Set<string> | null;
}

export function AiProfileSections({
	profiles,
	activeProfileId,
	activeProfile,
	onActiveProfileChange,
	onCreateProfile,
	onSaveProfile,
	visibleSections = null,
}: AiProfileSectionsProps) {
	const [profileDraft, setProfileDraft] = useState<AiProfile | null>(
		activeProfile ? structuredClone(activeProfile) : null,
	);
	const [availableModels, setAvailableModels] = useState<AiModel[] | null>(
		null,
	);
	const lastSavePromiseRef = useRef<Promise<void>>(Promise.resolve());

	const { apiState, setApiKeyDraft, handleSetApiKey, handleClearApiKey } =
		useApiKeySettings(activeProfileId);
	const {
		codexState,
		nowMs,
		refreshCodexAccount,
		handleCodexConnect,
		handleCodexDisconnect,
	} = useCodexAccount(profileDraft?.provider);

	const providerUsesApiKey = useMemo(
		() => profileDraft?.provider !== "codex_chatgpt",
		[profileDraft?.provider],
	);
	const showSection = (title: string) =>
		!visibleSections || visibleSections.has(title);

	const updateDraft = useCallback((updater: (prev: AiProfile) => AiProfile) => {
		setProfileDraft((prev) => (prev ? updater(prev) : prev));
	}, []);

	const persistDraft = useCallback(
		async (nextDraft: AiProfile) => {
			setProfileDraft(nextDraft);
			const savePromise = lastSavePromiseRef.current
				.catch(() => undefined)
				.then(() => onSaveProfile(nextDraft));
			lastSavePromiseRef.current = savePromise.catch(() => undefined);
			await savePromise;
		},
		[onSaveProfile],
	);

	const handleSave = useCallback(async () => {
		if (!profileDraft) return;
		await onSaveProfile(profileDraft);
	}, [profileDraft, onSaveProfile]);

	return (
		<>
			{showSection("Profiles") ? (
				<AiActiveProfileSection
					profiles={profiles}
					activeProfileId={activeProfileId}
					onActiveProfileChange={onActiveProfileChange}
					onCreateProfile={onCreateProfile}
				/>
			) : null}

			{profileDraft && showSection("Provider") ? (
				<AiProviderSection
					profileDraft={profileDraft}
					availableModels={availableModels}
					secretConfigured={apiState.secretConfigured}
					onModelsChange={setAvailableModels}
					onUpdateDraft={updateDraft}
					onPersistDraft={persistDraft}
					onSave={handleSave}
				/>
			) : null}

			{apiState.error ? (
				<div className="settingsError">{apiState.error}</div>
			) : null}

			{profileDraft?.provider === "codex_chatgpt" &&
			showSection("ChatGPT Account") ? (
				<AiCodexAccountSection
					codexState={codexState}
					nowMs={nowMs}
					onConnect={handleCodexConnect}
					onDisconnect={handleCodexDisconnect}
					onRefresh={refreshCodexAccount}
				/>
			) : null}

			{profileDraft && providerUsesApiKey && showSection("API Key") ? (
				<AiApiKeySection
					apiKeyDraft={apiState.apiKeyDraft}
					secretConfigured={apiState.secretConfigured}
					keySaved={apiState.keySaved}
					onApiKeyDraftChange={setApiKeyDraft}
					onSaveKey={handleSetApiKey}
					onClearKey={handleClearApiKey}
				/>
			) : null}
		</>
	);
}
