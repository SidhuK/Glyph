import { getVersion } from "@tauri-apps/api/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { useSpace } from "@/contexts";
import { extractErrorMessage } from "@/lib/errorUtils";
import { loadSettings } from "@/lib/settings";
import { DURABLE_SETTINGS } from "@/lib/settings/definitions";
import { SETTINGS_QUERY_KEY } from "@/lib/settingsStore";
import { toast } from "@/lib/toast";
import { LATEST_RELEASE, type Release, findRelease } from "./releases";
import { useWhatsNewContext } from "./WhatsNewContext";

const APP_VERSION_QUERY_KEY = ["app-version"] as const;

export interface WhatsNewState {
	open: boolean;
	release: Release;
	close: () => void;
}

export function useWhatsNew(): WhatsNewState {
	const { requestedOpen, dismissedThisSession, dismiss } = useWhatsNewContext();
	const { isActive: onboardingActive } = useOnboarding();
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const versionQuery = useQuery({
		queryKey: APP_VERSION_QUERY_KEY,
		queryFn: () => getVersion(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const settingsQuery = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: () => loadSettings() });

	const currentRelease = versionQuery.data ? findRelease(versionQuery.data) : null;
	const settings = settingsQuery.data;
	const lastSeen = settings ? DURABLE_SETTINGS.whatsNewLastSeenVersion.read(settings) : null;
	// Users upgrading from before onboarding existed already have a space open.
	const onboarded =
		Boolean(spacePath) ||
		(settings ? DURABLE_SETTINGS.onboardingCompletedVersion.read(settings) > 0 : false);
	const unseenVersion =
		currentRelease && lastSeen !== null && lastSeen !== currentRelease.version
			? currentRelease.version
			: null;

	const markSeen = useMutation({
		mutationFn: (version: string) => DURABLE_SETTINGS.whatsNewLastSeenVersion.write(version),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
		onError: (error) => toast.error(extractErrorMessage(error)),
	});

	const autoOpen = unseenVersion !== null && onboarded && !dismissedThisSession;
	const open = !onboardingActive && (requestedOpen || autoOpen);

	const close = () => {
		dismiss();
		if (currentRelease && lastSeen !== currentRelease.version) {
			markSeen.mutate(currentRelease.version);
		}
	};

	return { open, release: currentRelease ?? LATEST_RELEASE, close };
}
