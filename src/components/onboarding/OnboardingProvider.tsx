import { getVersion } from "@tauri-apps/api/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { SETTINGS_QUERY_KEY } from "../../lib/settingsStore";
import { toast } from "../../lib/toast";
import { findRelease } from "../whats-new/releases";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { ONBOARDING_VERSION } from "./onboardingVersion";

export interface OnboardingApi {
	replay: () => void;
	isActive: boolean;
}

interface OnboardingContextValue extends OnboardingApi {
	ready: boolean;
	runId: number;
	complete: () => Promise<void>;
	dismiss: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const settings = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: () => loadSettings() });
	const [replayRunId, setReplayRunId] = useState<number | null>(null);
	const completion = useMutation({
		mutationFn: async (firstRun: boolean) => {
			// A first run already introduces this release, so its What's New sheet is marked seen.
			if (firstRun) {
				const release = findRelease(await getVersion());
				if (release) await DURABLE_SETTINGS.whatsNewLastSeenVersion.write(release.version);
			}
			await DURABLE_SETTINGS.onboardingCompletedVersion.write(ONBOARDING_VERSION);
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
		onError: (cause) => {
			toast.error(t("onboarding.errors.saveProgress"), {
				description: extractErrorMessage(cause),
			});
		},
	});
	const completeAsync = completion.mutateAsync;
	const completedVersion = settings.data?.ui.onboardingCompletedVersion;
	const firstRun = completedVersion === 0;
	const needsOnboarding = completedVersion !== undefined && completedVersion < ONBOARDING_VERSION;
	const isActive = replayRunId !== null || (!spacePath && needsOnboarding);

	const replay = useCallback(() => setReplayRunId((current) => (current ?? 0) + 1), []);
	const dismiss = useCallback(() => setReplayRunId(null), []);
	const complete = useCallback(async () => {
		try {
			await completeAsync(firstRun);
			setReplayRunId(null);
		} catch {
			// The mutation's onError already surfaced the failure as a toast.
		}
	}, [completeAsync, firstRun]);

	const value = useMemo<OnboardingContextValue>(
		() => ({
			replay,
			isActive,
			ready: settings.isSuccess || settings.isError,
			runId: replayRunId ?? 0,
			complete,
			dismiss,
		}),
		[complete, dismiss, isActive, replay, replayRunId, settings.isError, settings.isSuccess],
	);

	return (
		<OnboardingContext.Provider value={value}>
			{children}
			{spacePath && replayRunId !== null ? (
				<OnboardingOverlay key={replayRunId} onFinish={complete} onDismiss={dismiss} />
			) : null}
		</OnboardingContext.Provider>
	);
}

function useOnboardingContext(): OnboardingContextValue {
	const ctx = useContext(OnboardingContext);
	if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
	return ctx;
}

export function useOnboarding(): OnboardingApi {
	const { replay, isActive } = useOnboardingContext();
	return { replay, isActive };
}

export function useOnboardingControls(): OnboardingContextValue {
	return useOnboardingContext();
}
