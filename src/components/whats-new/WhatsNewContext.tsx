import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

interface WhatsNewContextValue {
	requestedOpen: boolean;
	dismissedThisSession: boolean;
	show: () => void;
	dismiss: () => void;
}

const WhatsNewContext = createContext<WhatsNewContextValue | null>(null);

export function WhatsNewProvider({ children }: { children: ReactNode }) {
	const [requestedOpen, setRequestedOpen] = useState(false);
	const [dismissedThisSession, setDismissedThisSession] = useState(false);
	const show = useCallback(() => setRequestedOpen(true), []);
	const dismiss = useCallback(() => {
		setRequestedOpen(false);
		setDismissedThisSession(true);
	}, []);
	const value = useMemo(
		() => ({ requestedOpen, dismissedThisSession, show, dismiss }),
		[dismiss, dismissedThisSession, requestedOpen, show],
	);
	return <WhatsNewContext.Provider value={value}>{children}</WhatsNewContext.Provider>;
}

export function useWhatsNewContext(): WhatsNewContextValue {
	const value = useContext(WhatsNewContext);
	if (!value) throw new Error("useWhatsNewContext must be used inside WhatsNewProvider");
	return value;
}
