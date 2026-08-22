import { useSyncExternalStore } from "react";

type AiPanelSessionSnapshot = {
	jobId: string | null;
	keepMounted: boolean;
};

let jobId: string | null = null;
let keepMounted = false;
let keepAliveEpoch = 0;
let snapshot: AiPanelSessionSnapshot = { jobId: null, keepMounted: false };
const listeners = new Set<() => void>();

function emit(): void {
	snapshot = { jobId, keepMounted };
	for (const listener of listeners) {
		listener();
	}
}

export function setActiveAiHistoryJobId(next: string | null): void {
	const normalized = next?.trim() || null;
	if (jobId === normalized) return;
	jobId = normalized;
	emit();
}

export function beginAiPanelKeepMounted(): number {
	keepAliveEpoch += 1;
	if (!keepMounted) {
		keepMounted = true;
		emit();
	}
	return keepAliveEpoch;
}

export function endAiPanelKeepMounted(epoch: number): void {
	if (epoch !== keepAliveEpoch || !keepMounted) return;
	keepMounted = false;
	emit();
}

export function clearAiPanelSession(): void {
	keepAliveEpoch += 1;
	if (!jobId && !keepMounted) return;
	jobId = null;
	keepMounted = false;
	emit();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot(): AiPanelSessionSnapshot {
	return snapshot;
}

export function useAiPanelSession(): AiPanelSessionSnapshot {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
