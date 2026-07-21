import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	DEFAULT_DATE_DISPLAY_FORMAT,
	type DateDisplayFormat,
	formatDisplayDate,
	formatLocalClockTime,
	parseDisplayDateInput,
} from "./dateDisplayFormat";
import {
	type LicenseActivateResult,
	type LicenseStatus,
	invoke,
} from "./tauri";

const LICENSE_UPDATED_EVENT = "glyph:license-updated";

function dispatchLicenseUpdated(status: LicenseStatus) {
	window.dispatchEvent(
		new CustomEvent<LicenseStatus>(LICENSE_UPDATED_EVENT, { detail: status }),
	);
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
	return invoke("license_bootstrap_status");
}

export async function activateLicenseKey(
	licenseKey: string,
): Promise<LicenseActivateResult> {
	const result = await invoke("license_activate", {
		license_key: licenseKey,
	});
	dispatchLicenseUpdated(result.status);
	return result;
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

export function formatLicenseDate(
	timestampMs: number | null,
	format: DateDisplayFormat = DEFAULT_DATE_DISPLAY_FORMAT,
): string {
	if (timestampMs == null) return "";
	const date = parseDisplayDateInput(timestampMs);
	if (!date) return "";
	return formatDisplayDate(date, format, {
		time: formatLocalClockTime(date),
	});
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
	const statusRef = useRef<LicenseStatus | null>(status);
	statusRef.current = status;

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
