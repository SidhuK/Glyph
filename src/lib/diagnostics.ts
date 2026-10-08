import { listen } from "@tauri-apps/api/event";
import type { SettingsUpdatedPayload } from "./settings/model";
import { type FrontendLogEntry, invoke } from "./tauri";

/** Coalesces bursts of errors (render loops, repeated warnings) into one IPC call. */
const FLUSH_DELAY_MS = 500;
const MAX_QUEUED_ENTRIES = 200;
const MAX_MESSAGE_LENGTH = 4000;

let forwarding = false;
let queue: FrontendLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function describe(value: unknown): string {
	if (value instanceof Error) {
		return value.stack ? `${value.name}: ${value.message}\n${value.stack}` : String(value);
	}
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function flush() {
	flushTimer = null;
	const entries = queue;
	queue = [];
	if (entries.length === 0) return;
	// Never report this failure through console.error, which would loop back here.
	void invoke("diagnostics_log_frontend", { entries }).catch(() => {});
}

function record(level: FrontendLogEntry["level"], values: readonly unknown[]) {
	if (!forwarding) return;
	const message = values.map(describe).join(" ").slice(0, MAX_MESSAGE_LENGTH);
	queue.push({ level, message });
	if (queue.length > MAX_QUEUED_ENTRIES) queue.shift();
	flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

function refreshForwarding() {
	void invoke("diagnostics_sync_logging")
		.then((enabled) => {
			forwarding = enabled;
		})
		.catch(() => {});
}

/**
 * Forwards uncaught errors and console errors/warnings from this window to the
 * native diagnostic log. Native code drops them unless diagnostic logging is on.
 */
export function installDiagnosticsForwarding() {
	for (const level of ["error", "warn"] as const) {
		const original = console[level].bind(console);
		console[level] = (...values: unknown[]) => {
			original(...values);
			record(level, values);
		};
	}
	window.addEventListener("error", (event) => {
		record("error", ["Uncaught error:", event.error ?? event.message]);
	});
	window.addEventListener("unhandledrejection", (event) => {
		record("error", ["Unhandled promise rejection:", event.reason]);
	});
	refreshForwarding();
	void listen<SettingsUpdatedPayload>("settings:updated", ({ payload }) => {
		if (payload.ui?.developerMode !== undefined || payload.ui?.diagnosticLogging !== undefined) {
			refreshForwarding();
		}
	}).catch(() => {});
}
