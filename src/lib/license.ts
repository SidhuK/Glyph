import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	trackLicenseActivationFailed,
	trackLicenseActivationSucceeded,
	trackLicenseTrialExpired,
	trackLicenseTrialStarted,
} from "./analytics";
import {
	type LicenseActivateResult,
	type LicenseStatus,
	invoke,
} from "./tauri";

const LICENSE_UPDATED_EVENT = "glyph:license-updated";
const MAX_TRACKED_TRIAL_EVENTS = 32;
const trackedTrialStartTimes = new Set<number>();
const trackedTrialExpiryTimes = new Set<number>();

function dispatchLicenseUpdated(status: LicenseStatus) {
	window.dispatchEvent(
		new CustomEvent<LicenseStatus>(LICENSE_UPDATED_EVENT, { detail: status }),
	);
}

function rememberTrackedTrial(set: Set<number>, timestampMs: number): boolean {
	if (set.has(timestampMs)) return false;
	if (set.size >= MAX_TRACKED_TRIAL_EVENTS) {
		const oldest = set.values().next().value;
		if (typeof oldest === "number") {
			set.delete(oldest);
		}
	}
	set.add(timestampMs);
	return true;
}

function detectLicenseErrorCode(cause: unknown): string {
	if (typeof cause === "object" && cause !== null && "code" in cause) {
		const code = (cause as { code?: unknown }).code;
		if (typeof code === "string" && code.trim()) {
			return code;
		}
	}

	const message =
		cause instanceof Error
			? cause.message.toLowerCase()
			: typeof cause === "string"
				? cause.toLowerCase()
				: "";

	if (message.includes("invalid")) return "invalid_license";
	if (message.includes("timed out") || message.includes("could not reach")) {
		return "network_error";
	}
	if (message.includes("too many")) return "service_error";
	return "unknown";
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
	return invoke("license_bootstrap_status");
}

export async function activateLicenseKey(
	licenseKey: string,
): Promise<LicenseActivateResult> {
	try {
		const result = await invoke("license_activate", {
			license_key: licenseKey,
		});
		dispatchLicenseUpdated(result.status);
		void trackLicenseActivationSucceeded();
		return result;
	} catch (cause) {
		void trackLicenseActivationFailed(detectLicenseErrorCode(cause));
		throw cause;
	}
}

export async function clearLocalLicense(): Promise<LicenseActivateResult> {
	const result = await invoke("license_clear_local");
	dispatchLicenseUpdated(result.status);
	return result;
}

export function formatTrialRemaining(seconds: number | null): string {
	if (seconds == null || seconds <= 0) return "Trial expired";
	if (seconds < 60) return "Less than a minute left";

	const minutes = Math.ceil(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} left`;

	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;
	if (hours < 48) {
		if (remMinutes === 0) {
			return `${hours} hour${hours === 1 ? "" : "s"} left`;
		}
		return `${hours}h ${remMinutes}m left`;
	}

	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	if (remHours === 0) {
		return `${days} day${days === 1 ? "" : "s"} left`;
	}
	return `${days}d ${remHours}h left`;
}

export function formatLicenseDate(timestampMs: number | null): string {
	if (timestampMs == null) return "";
	try {
		return new Date(timestampMs).toLocaleString();
	} catch {
		return "";
	}
}

export function useLicenseStatus(reloadOnWindowFocus = true): {
	status: LicenseStatus | null;
	loading: boolean;
	error: string;
	reload: () => Promise<void>;
} {
	const [status, setStatus] = useState<LicenseStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const focusUnlistenRef = useRef<(() => void) | null>(null);
	const statusRef = useRef<LicenseStatus | null>(null);

	useEffect(() => {
		statusRef.current = status;
	}, [status]);

	const reload = useCallback(async () => {
		setError("");
		setLoading((prev) => prev || statusRef.current == null);
		try {
			const next = await getLicenseStatus();
			setStatus(next);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Failed to load license status",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	useEffect(() => {
		const onUpdated = (event: Event) => {
			const detail = (event as CustomEvent<LicenseStatus>).detail;
			if (!detail) return;
			setStatus(detail);
			setError("");
			setLoading(false);
		};
		window.addEventListener(LICENSE_UPDATED_EVENT, onUpdated);
		return () => window.removeEventListener(LICENSE_UPDATED_EVENT, onUpdated);
	}, []);

	useEffect(() => {
		if (!status?.is_official_build) return;

		if (
			status.mode === "trial_active" &&
			typeof status.trial_started_at_ms === "number" &&
			Math.abs(Date.now() - status.trial_started_at_ms) < 15_000 &&
			rememberTrackedTrial(trackedTrialStartTimes, status.trial_started_at_ms)
		) {
			void trackLicenseTrialStarted();
		}

		if (
			status.mode === "trial_expired" &&
			typeof status.trial_expires_at_ms === "number" &&
			rememberTrackedTrial(trackedTrialExpiryTimes, status.trial_expires_at_ms)
		) {
			void trackLicenseTrialExpired();
		}
	}, [status]);

	useEffect(() => {
		if (!reloadOnWindowFocus) return;

		const onFocus = () => {
			void reload();
		};

		window.addEventListener("focus", onFocus);

		let disposed = false;
		try {
			void getCurrentWindow()
				.onFocusChanged(({ payload }) => {
					if (payload) void reload();
				})
				.then((unlisten) => {
					if (disposed) {
						unlisten();
						return;
					}
					focusUnlistenRef.current = unlisten;
				})
				.catch(() => {
					// best-effort desktop refresh only
				});
		} catch {
			// best-effort desktop refresh only
		}

		return () => {
			disposed = true;
			window.removeEventListener("focus", onFocus);
			focusUnlistenRef.current?.();
			focusUnlistenRef.current = null;
		};
	}, [reload, reloadOnWindowFocus]);

	return { status, loading, error, reload };
}
