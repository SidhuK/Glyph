import { loadSettings } from "./settings";
import { getSettingsStore, saveSettingsStore, withSettingsStoreWriteLock } from "./settingsStore";

const COMMUNITY_INVITE_STATE_KEY = "community.inviteState";
const COMMUNITY_INVITE_STATE_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Let people settle in before asking for anything. */
const FIRST_INVITE_AFTER_MS = 3 * DAY_MS;
const REPEAT_INVITE_AFTER_MS = 30 * DAY_MS;
const MAX_INVITES = 2;

export type CommunityAction = "starred" | "joined";

export interface CommunityInviteState {
	version: typeof COMMUNITY_INVITE_STATE_VERSION;
	/** Set the first time a space is open, so the three days count actual use. */
	firstSeenAt: number | null;
	lastShownAt: number | null;
	timesShown: number;
	starred: boolean;
	joined: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteOr<T>(value: unknown, fallback: T): number | T {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeCommunityInviteState(value: unknown): CommunityInviteState {
	const record = isRecord(value) && value.version === COMMUNITY_INVITE_STATE_VERSION ? value : {};
	return {
		version: COMMUNITY_INVITE_STATE_VERSION,
		firstSeenAt: finiteOr(record.firstSeenAt, null),
		lastShownAt: finiteOr(record.lastShownAt, null),
		timesShown: Math.max(0, Math.floor(finiteOr(record.timesShown, 0))),
		starred: record.starred === true,
		joined: record.joined === true,
	};
}

export function isCommunityInviteDue(state: CommunityInviteState, now: number): boolean {
	if (state.starred && state.joined) return false;
	if (state.timesShown >= MAX_INVITES) return false;
	if (state.firstSeenAt === null || now - state.firstSeenAt < FIRST_INVITE_AFTER_MS) return false;
	return state.lastShownAt === null || now - state.lastShownAt >= REPEAT_INVITE_AFTER_MS;
}

function updateState(
	update: (state: CommunityInviteState, now: number) => CommunityInviteState,
): Promise<CommunityInviteState> {
	return withSettingsStoreWriteLock(async () => {
		const now = Date.now();
		const store = await getSettingsStore();
		const current = normalizeCommunityInviteState(
			await store.get<unknown>(COMMUNITY_INVITE_STATE_KEY),
		);
		const next = update(current, now);
		await store.set(COMMUNITY_INVITE_STATE_KEY, next);
		await saveSettingsStore(store);
		return next;
	});
}

/** Reads the invite state without starting the clock or claiming an invite. */
export async function loadCommunityInviteState(): Promise<CommunityInviteState> {
	const store = await getSettingsStore();
	return normalizeCommunityInviteState(await store.get<unknown>(COMMUNITY_INVITE_STATE_KEY));
}

/**
 * Starts the clock on first launch and reports whether to show the invite now.
 * A due invite is claimed in the same write, so only one window ever shows it.
 * Call this only where the invite will actually be displayed.
 */
export async function claimCommunityInvite(): Promise<boolean> {
	const enabled = (await loadSettings()).ui.communityInvite;
	let show = false;
	await updateState((current, now) => {
		const started = { ...current, firstSeenAt: current.firstSeenAt ?? now };
		show = enabled && isCommunityInviteDue(started, now);
		return show ? { ...started, lastShownAt: now, timesShown: started.timesShown + 1 } : started;
	});
	return show;
}

export function recordCommunityAction(action: CommunityAction): Promise<CommunityInviteState> {
	return updateState((current) => ({ ...current, [action]: true }));
}
