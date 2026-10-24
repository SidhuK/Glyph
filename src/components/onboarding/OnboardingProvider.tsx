import { getVersion } from "@tauri-apps/api/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { useSpace } from "../../contexts";
import { loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { SETTINGS_QUERY_KEY } from "../../lib/settingsStore";
import { findRelease } from "../whats-new/releases";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { ONBOARDING_VERSION } from "./onboardingVersion";

export interface OnboardingApi {
	replay: () => void;
	isActive: boolean;
}

interface OnboardingContextValue extends OnboardingApi {
	ready: boolean;
	loadError: Error | null;
	retryLoad: () => void;
	runId: number;
	/** Records completion; rejects on failure, which `completion.error` also reports. */
	complete: () => Promise<void>;
	/** Records completion; the outcome is reported only through `completion`. */
	finish: () => void;
	completion: { isPending: boolean; error: Error | null };
	dismiss: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const settings = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: () => loadSettings() });
	const [replayRunId, setReplayRunId] = useState<number | null>(null);
	// Completion is recorded before the space picker opens, so the flow must stay up until a space does.
	const [holdFlow, setHoldFlow] = useState(false);
	if (spacePath && holdFlow) setHoldFlow(false);
	const completion = useMutation({
		mutationFn: async (firstRun: boolean) => {
			// A first run already introduces this release, so its What's New sheet is marked seen.
			if (firstRun) {
				const release = findRelease(await getVersion());
				if (release) await DURABLE_SETTINGS.whatsNewLastSeenVersion.write(release.version);
			}
			await DURABLE_SETTINGS.onboardingCompletedVersion.write(ONBOARDING_VERSION);
		},
		onSuccess: () => {
			setReplayRunId(null);
			setHoldFlow(true);
			return queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
		},
	});
	const { mutate: completeMutate, mutateAsync: completeAsync } = completion;
	const completedVersion = settings.data?.ui.onboardingCompletedVersion;
	const firstRun = completedVersion === 0;
	const needsOnboarding = completedVersion !== undefined && completedVersion < ONBOARDING_VERSION;
	const isActive = replayRunId !== null || (!spacePath && (needsOnboarding || holdFlow));

	const replay = useCallback(() => setReplayRunId((current) => (current ?? 0) + 1), []);
	const dismiss = useCallback(() => setReplayRunId(null), []);
	const complete = useCallback(() => completeAsync(firstRun), [completeAsync, firstRun]);
	const finish = useCallback(() => completeMutate(firstRun), [completeMutate, firstRun]);
	const refetchSettings = settings.refetch;
	const retryLoad = useCallback(() => void refetchSettings(), [refetchSettings]);

	const value = useMemo<OnboardingContextValue>(
		() => ({
			replay,
			isActive,
			ready: settings.isSuccess,
			loadError: settings.error,
			retryLoad,
			runId: replayRunId ?? 0,
			complete,
			finish,
			completion: { isPending: completion.isPending, error: completion.error },
			dismiss,
		}),
		[
			complete,
			completion.error,
			completion.isPending,
			dismiss,
			finish,
			isActive,
			replay,
			replayRunId,
			retryLoad,
			settings.error,
			settings.isSuccess,
		],
	);

	return (
		<OnboardingContext.Provider value={value}>
			{children}
			{spacePath && replayRunId !== null ? (
				<OnboardingOverlay key={replayRunId} onDismiss={dismiss} />
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
