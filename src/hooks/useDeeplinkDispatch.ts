import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { DeeplinkErrorPayload, DeeplinkEvent } from "../lib/deeplink";
import type { SpaceLifecycleResult } from "../lib/spaceLifecycle";
import { invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";
import { toast } from "../lib/toast";

const DEEPLINK_ERROR_TOAST_ID = "glyph-deeplink-error";
const MAX_REMEMBERED_IDS = 256;

export interface UseDeeplinkDispatchOptions {
	settingsLoaded: boolean;
	submitNavigate: (event: DeeplinkEvent) => Promise<SpaceLifecycleResult>;
}

export function useDeeplinkDispatch(options: UseDeeplinkDispatchOptions): void {
	const { settingsLoaded } = options;
	const { t } = useTranslation("shell");
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const seenIdsRef = useRef<Set<number>>(new Set());
	const heldRef = useRef<DeeplinkEvent[]>([]);

	const showError = useCallback(
		(description?: string) => {
			toast.error(t("deeplink.openFailed"), {
				description,
				id: DEEPLINK_ERROR_TOAST_ID,
			});
		},
		[t],
	);

	const errorMessage = useCallback(
		(code: string): string => {
			switch (code) {
				case "space_not_found":
					return t("deeplink.spaceNotFound");
				case "note_not_found":
					return t("deeplink.noteNotFound");
				case "note_not_markdown":
					return t("deeplink.noteNotMarkdown");
				default:
					return t("deeplink.malformed");
			}
		},
		[t],
	);

	const claimId = useCallback((id: number): boolean => {
		const seen = seenIdsRef.current;
		if (seen.has(id)) return false;
		seen.add(id);
		while (seen.size > MAX_REMEMBERED_IDS) {
			const oldest = seen.values().next();
			if (oldest.done) break;
			seen.delete(oldest.value);
		}
		return true;
	}, []);

	const pump = useCallback(() => {
		if (!optionsRef.current.settingsLoaded) return;
		const held = heldRef.current.splice(0);
		for (const event of held) {
			void optionsRef.current.submitNavigate(event).then((result) => {
				if (result.kind === "failed") showError();
			});
		}
	}, [showError]);

	const enqueue = useCallback(
		(event: DeeplinkEvent) => {
			if (!claimId(event.id)) return;
			heldRef.current.push(event);
			pump();
		},
		[claimId, pump],
	);

	const reportError = useCallback(
		(payload: DeeplinkErrorPayload) => {
			if (!claimId(payload.id)) return;
			showError(errorMessage(payload.code));
		},
		[claimId, errorMessage, showError],
	);

	const drainPending = useCallback(async () => {
		try {
			const pending = await invoke("deeplink_take_pending");
			for (const event of pending.actions) enqueue(event);
			for (const error of pending.errors) reportError(error);
		} catch (error) {
			console.warn("Failed to take pending deeplinks", error);
		}
	}, [enqueue, reportError]);

	useTauriEvent("deeplink:action", (payload) => {
		enqueue(payload);
	});

	useTauriEvent("deeplink:error", (payload) => {
		reportError(payload);
	});

	useEffect(() => {
		if (!settingsLoaded) return;
		void drainPending().then(pump);
	}, [drainPending, pump, settingsLoaded]);
}
