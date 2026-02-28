import {
	getAnalyticsEnabled,
	getOrCreateAnalyticsDistinctId,
	loadSettings,
} from "./settings";
import {
	type AiAssistantMode,
	type AiProviderKind,
	type AnalyticsEventName,
	invoke,
} from "./tauri";

type TrackProps = Record<string, unknown>;

function sanitizeValue(value: unknown): unknown {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		value === null
	) {
		return value;
	}
	if (Array.isArray(value)) {
		return value.slice(0, 16).map(sanitizeValue);
	}
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(
			value as Record<string, unknown>,
		)) {
			if (!key) continue;
			out[key] = sanitizeValue(child);
		}
		return out;
	}
	return String(value);
}

async function track(
	event: AnalyticsEventName,
	properties: TrackProps,
): Promise<void> {
	const enabled = await getAnalyticsEnabled();
	if (!enabled) return;
	const distinctId = await getOrCreateAnalyticsDistinctId();
	const sanitized: TrackProps = {};
	for (const [key, value] of Object.entries(properties)) {
		sanitized[key] = sanitizeValue(value);
	}
	await invoke("analytics_track", {
		request: {
			event,
			distinct_id: distinctId,
			properties: sanitized,
		},
	});
}

function queryLengthBucket(query: string): string {
	const len = query.trim().length;
	if (len === 0) return "0";
	if (len <= 10) return "1_10";
	if (len <= 30) return "11_30";
	return "31_plus";
}

function resultCountBucket(count: number): string {
	if (count <= 0) return "0";
	if (count <= 5) return "1_5";
	if (count <= 20) return "6_20";
	return "21_plus";
}

export async function trackAppStarted(): Promise<void> {
	try {
		const settings = await loadSettings();
		await track("app_started", {
			has_previous_space: Boolean(settings.currentSpacePath),
		});
	} catch {
		// best effort telemetry
	}
}

export async function trackSpaceOpened(params: {
	source: "continue_last" | "open_dialog" | "open_recent" | "create_dialog";
	spaceSchemaVersion?: number | null;
}): Promise<void> {
	try {
		await track("space_opened", {
			source: params.source,
			space_schema_version:
				typeof params.spaceSchemaVersion === "number"
					? params.spaceSchemaVersion
					: null,
		});
	} catch {
		// best effort telemetry
	}
}

export async function trackIndexRebuildStarted(): Promise<void> {
	try {
		await track("index_rebuild_started", {});
	} catch {
		// best effort telemetry
	}
}

export async function trackSearchExecuted(params: {
	query: string;
	resultCount: number;
}): Promise<void> {
	try {
		await track("search_executed", {
			query_length_bucket: queryLengthBucket(params.query),
			result_count_bucket: resultCountBucket(params.resultCount),
		});
	} catch {
		// best effort telemetry
	}
}

export async function trackNoteCreated(params: {
	entrypoint: "ui" | "daily_note" | "other";
}): Promise<void> {
	try {
		await track("note_created", { entrypoint: params.entrypoint });
	} catch {
		// best effort telemetry
	}
}

export async function trackAiChatStarted(params: {
	provider: AiProviderKind;
	mode: AiAssistantMode;
	hasContext: boolean;
}): Promise<void> {
	try {
		await track("ai_chat_started", {
			provider: params.provider,
			mode: params.mode,
			has_context: params.hasContext,
		});
	} catch {
		// best effort telemetry
	}
}

export async function trackSettingsChanged(params: {
	settingKey: "aiAssistantMode" | "analyticsEnabled";
	newValue: string;
}): Promise<void> {
	try {
		await track("settings_changed", {
			setting_key: params.settingKey,
			new_value: params.newValue,
		});
	} catch {
		// best effort telemetry
	}
}
