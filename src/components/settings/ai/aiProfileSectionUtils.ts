export const CODEX_RATE_LIMIT_REFRESH_MS = 30 * 60 * 1000;
export const CODEX_RESET_TIME_TICK_MS = 30 * 1000;

export function formatRateLimitWindow(minutes: number | null): string {
	if (minutes == null || !Number.isFinite(minutes)) return "window";
	if (minutes === 10080) return "weekly window";
	if (minutes === 300) return "5-hour window";
	if (minutes >= 60 && minutes % 60 === 0) {
		const hours = minutes / 60;
		return `${hours}-hour window`;
	}
	return `${minutes}-minute window`;
}

export function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

export function toneForRateLimitUsed(
	usedPercent: number,
): "ok" | "warn" | "danger" {
	const clamped = clampPercent(usedPercent);
	const remaining = 100 - clamped;
	if (remaining <= 20) return "danger";
	if (remaining <= 50) return "warn";
	return "ok";
}

export function toneForCodexStatus(
	status: string,
): "settingsPillOk" | "settingsPillWarn" | "settingsPillInfo" {
	if (status === "connected") return "settingsPillOk";
	if (status === "disconnected") return "settingsPillWarn";
	return "settingsPillInfo";
}

export function toneForSecretConfigured(
	secretConfigured: boolean | null,
): "settingsPillOk" | "settingsPillWarn" | "settingsPillError" {
	if (secretConfigured === true) return "settingsPillOk";
	if (secretConfigured === false) return "settingsPillError";
	return "settingsPillWarn";
}

export function labelForCodexStatus(status: string): string {
	if (!status) return "Unknown";
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function toEpochMs(timestamp: number | null): number | null {
	if (timestamp == null || !Number.isFinite(timestamp) || timestamp <= 0) {
		return null;
	}
	return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatCountdown(targetEpochMs: number, nowMs: number): string {
	const diffMs = Math.max(0, targetEpochMs - nowMs);
	const totalMinutes = Math.ceil(diffMs / 60_000);
	if (totalMinutes <= 1) return "<1m";
	const days = Math.floor(totalMinutes / 1_440);
	const hours = Math.floor((totalMinutes % 1_440) / 60);
	const minutes = totalMinutes % 60;
	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
	return parts.slice(0, 2).join(" ");
}

export function formatResetMessage(
	timestamp: number | null,
	nowMs: number,
): string {
	const resetEpochMs = toEpochMs(timestamp);
	if (!resetEpochMs) return "Reset time unavailable";
	if (resetEpochMs <= nowMs) return "Reset reached";
	return `Resets in ${formatCountdown(resetEpochMs, nowMs)}`;
}
