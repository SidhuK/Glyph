import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	type DeeplinkErrorPayload,
	type DeeplinkEvent,
	isSameSpacePath,
} from "../lib/deeplink";
import { invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";
import { toast } from "../lib/toast";

const DEEPLINK_ERROR_TOAST_ID = "glyph-deeplink-error";
/**
 * A deeplink can only act on the new space once React state reflects the
 * switch. Settings hydration is best-effort and may never land, so the wait is
 * bounded rather than open-ended.
 */
const SPACE_SETTLE_TIMEOUT_MS = 5000;
/** Ids are only needed long enough to spot a pending-queue replay. */
const MAX_REMEMBERED_IDS = 256;

type Waiter = { ready: () => boolean; settle: (ready: boolean) => void };

export interface UseDeeplinkDispatchOptions {
	spacePath: string | null;
	/** Space whose settings are currently hydrated; see `UIContext`. */
	settingsSpacePath: string | null;
	settingsLoaded: boolean;
	/** Saves the open editors, switches space, and reports whether it worked. */
	selectSpace: (path: string) => Promise<boolean>;
	openWorkspaceFile: (path: string) => Promise<void>;
	openPalette: (mode: "commands" | "search", query?: string) => void;
	requestOpenDailyNote: () => void;
}

/**
 * Routes native `glyph://` deeplinks onto the existing open/search/daily flows.
 * Native code has already validated the space and note, so failures arrive as
 * `deeplink:error` codes rather than being re-checked here.
 */
export function useDeeplinkDispatch(options: UseDeeplinkDispatchOptions): void {
	const { spacePath, settingsSpacePath, settingsLoaded } = options;
	const { t } = useTranslation("shell");

	const optionsRef = useRef(options);
	optionsRef.current = options;

	const seenIdsRef = useRef<Set<number>>(new Set());
	const queueRef = useRef<DeeplinkEvent[]>([]);
	const runningRef = useRef(false);
	const waitersRef = useRef<Waiter[]>([]);

	// Resume any action that was waiting on the space (or its settings) to land.
	// spacePath / settingsSpacePath are read so the effect re-runs when they change;
	// waiters themselves close over ready() against optionsRef.
	useEffect(() => {
		void spacePath;
		void settingsSpacePath;
		for (const waiter of [...waitersRef.current]) {
			if (waiter.ready()) waiter.settle(true);
		}
	}, [spacePath, settingsSpacePath]);

	const waitForState = useCallback((ready: () => boolean): Promise<boolean> => {
		if (ready()) return Promise.resolve(true);
		return new Promise<boolean>((resolve) => {
			const waiter: Waiter = {
				ready,
				settle: (settled) => {
					clearTimeout(timer);
					waitersRef.current = waitersRef.current.filter(
						(entry) => entry !== waiter,
					);
					resolve(settled);
				},
			};
			const timer = setTimeout(
				() => waiter.settle(false),
				SPACE_SETTLE_TIMEOUT_MS,
			);
			waitersRef.current.push(waiter);
		});
	}, []);

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

	const ensureSpace = useCallback(
		async (space: string): Promise<boolean> => {
			if (isSameSpacePath(optionsRef.current.spacePath, space)) return true;
			// `selectSpace` saves open editors and surfaces its own failures.
			if (!(await optionsRef.current.selectSpace(space))) return false;
			return waitForState(() =>
				isSameSpacePath(optionsRef.current.spacePath, space),
			);
		},
		[waitForState],
	);

	const runEvent = useCallback(
		async (event: DeeplinkEvent) => {
			try {
				if (!(await ensureSpace(event.space))) {
					showError();
					return;
				}
				switch (event.kind) {
					case "open_space":
						return;
					case "open_note":
						await optionsRef.current.openWorkspaceFile(event.path);
						return;
					case "search":
						optionsRef.current.openPalette("search", event.q);
						return;
					case "open_daily_note": {
						// The daily note folder and template are per-space settings, so
						// acting before they rehydrate would target the previous space.
						const ready = await waitForState(() =>
							isSameSpacePath(
								optionsRef.current.settingsSpacePath,
								event.space,
							),
						);
						if (!ready) {
							showError();
							return;
						}
						optionsRef.current.requestOpenDailyNote();
						return;
					}
					default: {
						const _exhaustive: never = event;
						return _exhaustive;
					}
				}
			} catch (error) {
				console.error("Failed to run deeplink", error);
				showError();
			}
		},
		[ensureSpace, showError, waitForState],
	);

	const processQueue = useCallback(async () => {
		if (runningRef.current) return;
		runningRef.current = true;
		try {
			while (queueRef.current.length > 0) {
				const next = queueRef.current.shift();
				if (next) await runEvent(next);
			}
		} finally {
			runningRef.current = false;
		}
	}, [runEvent]);

	/** Returns false when this id was already handled (live emit vs. queue replay). */
	const claimId = useCallback((id: number): boolean => {
		const seen = seenIdsRef.current;
		if (seen.has(id)) return false;
		seen.add(id);
		// Sets iterate in insertion order, so this evicts the oldest ids.
		while (seen.size > MAX_REMEMBERED_IDS) {
			const oldest = seen.values().next();
			if (oldest.done) break;
			seen.delete(oldest.value);
		}
		return true;
	}, []);

	const enqueue = useCallback(
		(event: DeeplinkEvent) => {
			if (!claimId(event.id)) return;
			queueRef.current.push(event);
			void processQueue();
		},
		[claimId, processQueue],
	);

	const reportError = useCallback(
		(payload: DeeplinkErrorPayload) => {
			if (!claimId(payload.id)) return;
			showError(errorMessage(payload.code));
		},
		[claimId, errorMessage, showError],
	);

	// Deeplinks are queued natively as well as emitted, because the webview is
	// not listening yet on a cold start. Draining is idempotent thanks to ids.
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
		void drainPending();
	});

	useTauriEvent("deeplink:error", (payload) => {
		reportError(payload);
		void drainPending();
	});

	// Wait for settings so a cold-start deeplink does not race session restore.
	useEffect(() => {
		if (!settingsLoaded) return;
		void drainPending();
	}, [drainPending, settingsLoaded]);
}
