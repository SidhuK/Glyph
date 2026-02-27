import { useCallback, useMemo, useState } from "react";
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
}

export function AiProfileSections({
	profiles,
	activeProfileId,
	activeProfile,
	onActiveProfileChange,
	onCreateProfile,
	onSaveProfile,
}: AiProfileSectionsProps) {
	const [profileDraft, setProfileDraft] = useState<AiProfile | null>(
		activeProfile ? structuredClone(activeProfile) : null,
	);
	const [availableModels, setAvailableModels] = useState<AiModel[] | null>(
		null,
	);

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

	const updateDraft = useCallback((updater: (prev: AiProfile) => AiProfile) => {
		setProfileDraft((prev) => (prev ? updater(prev) : prev));
	}, []);

	const persistDraft = useCallback(
		async (nextDraft: AiProfile) => {
			setProfileDraft(nextDraft);
			await onSaveProfile(nextDraft);
		},
		[onSaveProfile],
	);

	const handleSave = useCallback(async () => {
		if (!profileDraft) return;
		await onSaveProfile(profileDraft);
	}, [profileDraft, onSaveProfile]);

	return (
		<>
			<AiActiveProfileSection
				profiles={profiles}
				activeProfileId={activeProfileId}
				onActiveProfileChange={onActiveProfileChange}
				onCreateProfile={onCreateProfile}
			/>

			{profileDraft ? (
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

			{profileDraft?.provider === "codex_chatgpt" ? (
				<AiCodexAccountSection
					codexState={codexState}
					nowMs={nowMs}
					onConnect={handleCodexConnect}
					onDisconnect={handleCodexDisconnect}
					onRefresh={refreshCodexAccount}
				/>
			) : null}

			{profileDraft && providerUsesApiKey ? (
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
