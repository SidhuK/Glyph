import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiModel, AiProfile, AiProviderKind } from "../../../lib/tauri";
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
	onSaveProfile: (draft: AiProfile) => Promise<void>;
}

export function AiProfileSections({
	profiles,
	activeProfileId,
	activeProfile,
	onActiveProfileChange,
	onSaveProfile,
}: AiProfileSectionsProps) {
	const profileKey = activeProfile?.id ?? "none";

	return (
		<AiProfileSectionsBody
			key={profileKey}
			profiles={profiles}
			activeProfileId={activeProfileId}
			activeProfile={activeProfile}
			onActiveProfileChange={onActiveProfileChange}
			onSaveProfile={onSaveProfile}
		/>
	);
}

function AiProfileSectionsBody({
	profiles,
	activeProfileId,
	activeProfile,
	onActiveProfileChange,
	onSaveProfile,
}: AiProfileSectionsProps) {
	const [profileDraft, setProfileDraft] = useState<AiProfile | null>(
		activeProfile ? structuredClone(activeProfile) : null,
	);
	const [availableModels, setAvailableModels] = useState<AiModel[] | null>(
		null,
	);
	const lastSavePromiseRef = useRef<Promise<void>>(Promise.resolve());
	const previousActiveProfileIdRef = useRef(activeProfile?.id ?? null);

	useEffect(() => {
		const nextProfileId = activeProfile?.id ?? null;
		if (previousActiveProfileIdRef.current === nextProfileId) return;
		previousActiveProfileIdRef.current = nextProfileId;
		setProfileDraft(activeProfile ? structuredClone(activeProfile) : null);
		setAvailableModels(null);
		lastSavePromiseRef.current = Promise.resolve();
	}, [activeProfile]);

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
			const savePromise = lastSavePromiseRef.current
				.catch(() => undefined)
				.then(() => onSaveProfile(nextDraft));
			lastSavePromiseRef.current = savePromise.catch(() => undefined);
			await savePromise;
		},
		[onSaveProfile],
	);

	const handleProviderChange = useCallback(
		async (provider: AiProviderKind) => {
			const nextProfile =
				profiles.find((profile) => profile.provider === provider) ?? null;
			if (!nextProfile || nextProfile.id === activeProfileId) return;
			await onActiveProfileChange(nextProfile.id);
		},
		[activeProfileId, onActiveProfileChange, profiles],
	);

	return (
		<>
			{profileDraft ? (
				<AiProviderSection
					profileDraft={profileDraft}
					availableModels={availableModels}
					secretConfigured={apiState.secretConfigured}
					onModelsChange={setAvailableModels}
					onProviderChange={handleProviderChange}
					onUpdateDraft={updateDraft}
					onPersistDraft={persistDraft}
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
