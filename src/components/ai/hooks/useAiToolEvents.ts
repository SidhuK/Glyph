import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { OrbState } from "thinking-orbs";
import { i18n } from "../../../i18n";
import { useTauriEvent } from "../../../lib/tauriEvents";
import type { AIActivityTimelineEvent } from "../AIActivityTimeline";
import {
	type ResponsePhase,
	SLOW_START_MS,
	type ToolPhase,
} from "../aiPanelConstants";
import type { RigChatStatus } from "./useRigChat";

interface UseAiToolEventsOptions {
	isChatMode: boolean;
	chatStatus: RigChatStatus;
}

type ToolState = {
	activeTools: string[];
	activityTimeline: AIActivityTimelineEvent[];
	responsePhase: ResponsePhase;
	showSlowStart: boolean;
	chatStatus: RigChatStatus;
	isChatMode: boolean;
};

type ToolStateAction =
	| {
			type: "sync-context";
			chatStatus: RigChatStatus;
			isChatMode: boolean;
	  }
	| {
			type: "reset-tool-state";
	  }
	| {
			type: "set-response-phase";
			responsePhase: ResponsePhase;
	  }
	| {
			type: "set-show-slow-start";
			showSlowStart: boolean;
	  }
	| {
			type: "set-activity-timeline";
			activityTimeline: AIActivityTimelineEvent[];
	  }
	| {
			type: "record-tool";
			tool: string;
			phase: ToolPhase;
			payload?: unknown;
			error?: string;
			at: number;
	  }
	| {
			type: "record-chunk";
			delta: string;
			at: number;
	  };

const INITIAL_STATE: ToolState = {
	activeTools: [],
	activityTimeline: [],
	responsePhase: "idle",
	showSlowStart: false,
	chatStatus: "ready",
	isChatMode: false,
};

function buildTextTimelineEntry(
	delta: string,
	at: number,
): AIActivityTimelineEvent {
	return {
		id: `text-${at}-${crypto.randomUUID()}`,
		kind: "text",
		text: delta,
		at,
	};
}

function reducer(state: ToolState, action: ToolStateAction): ToolState {
	switch (action.type) {
		case "sync-context": {
			if (action.isChatMode && !state.isChatMode) {
				return {
					...INITIAL_STATE,
					chatStatus: action.chatStatus,
					isChatMode: true,
				};
			}

			const next: ToolState = {
				...state,
				chatStatus: action.chatStatus,
				isChatMode: action.isChatMode,
			};

			if (action.chatStatus !== "streaming") {
				next.activeTools = [];
			}

			if (action.chatStatus === "submitted" && state.responsePhase === "idle") {
				next.responsePhase = "submitted";
				next.showSlowStart = false;
			}

			if (action.chatStatus === "streaming") {
				next.responsePhase = "streaming";
				next.showSlowStart = false;
			}

			if (action.chatStatus === "ready") {
				if (
					state.chatStatus === "streaming" ||
					state.chatStatus === "submitted"
				) {
					next.responsePhase = "idle";
				}
				next.showSlowStart = false;
			}

			if (action.chatStatus === "error") {
				next.responsePhase = "idle";
				next.showSlowStart = false;
			}

			return next;
		}
		case "reset-tool-state":
			return {
				...state,
				activeTools: [],
				activityTimeline: [],
				showSlowStart: false,
			};
		case "set-response-phase":
			return { ...state, responsePhase: action.responsePhase };
		case "set-show-slow-start":
			return { ...state, showSlowStart: action.showSlowStart };
		case "set-activity-timeline":
			return { ...state, activityTimeline: action.activityTimeline };
		case "record-tool": {
			return {
				...state,
				activeTools:
					action.phase === "call"
						? state.activeTools.includes(action.tool)
							? state.activeTools
							: [...state.activeTools, action.tool]
						: state.activeTools.filter((name) => name !== action.tool),
				responsePhase:
					action.phase === "call" && state.responsePhase !== "streaming"
						? "tooling"
						: state.responsePhase,
				activityTimeline:
					action.phase === "result"
						? [
								...state.activityTimeline,
								{ kind: "citation", payload: action.payload },
							]
						: action.phase === "error"
							? [
									...state.activityTimeline,
									{
										id: `error-${action.at}-${crypto.randomUUID()}`,
										kind: "error",
										message:
											action.error ??
											i18n.t("shell:ai.toolFailed", { tool: action.tool }),
										at: action.at,
									},
								]
							: state.activityTimeline,
			};
		}
		case "record-chunk": {
			const last = state.activityTimeline[state.activityTimeline.length - 1];
			const nextTimeline =
				last &&
				last.kind === "text" &&
				action.at - last.at <= 900 &&
				last.text.length < 6000
					? [
							...state.activityTimeline.slice(0, -1),
							{ ...last, text: `${last.text}${action.delta}`, at: action.at },
						]
					: [
							...state.activityTimeline,
							buildTextTimelineEntry(action.delta, action.at),
						];
			return {
				...state,
				showSlowStart: false,
				responsePhase: "streaming",
				activityTimeline: nextTimeline,
			};
		}
		default:
			return state;
	}
}

export function useAiToolEvents({
	isChatMode,
	chatStatus,
}: UseAiToolEventsOptions) {
	const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
	const activeToolJobIdRef = useRef<string | null>(null);
	const slowStartTimerRef = useRef<number | null>(null);
	const pendingChunkRef = useRef("");
	const chunkFrameRef = useRef<number | null>(null);

	const clearSlowStartTimer = useCallback(() => {
		if (slowStartTimerRef.current == null) return;
		window.clearTimeout(slowStartTimerRef.current);
		slowStartTimerRef.current = null;
	}, []);

	const clearPendingChunk = useCallback(() => {
		if (chunkFrameRef.current !== null) {
			window.cancelAnimationFrame(chunkFrameRef.current);
		}
		chunkFrameRef.current = null;
		pendingChunkRef.current = "";
	}, []);

	const flushPendingChunk = useCallback(() => {
		const delta = pendingChunkRef.current;
		clearPendingChunk();
		if (!delta) return;
		dispatch({
			type: "record-chunk",
			delta,
			at: Date.now(),
		});
	}, [clearPendingChunk]);

	const isAwaitingResponse =
		chatStatus === "submitted" || chatStatus === "streaming";

	useEffect(() => {
		if (isChatMode || chatStatus !== "streaming") {
			flushPendingChunk();
			activeToolJobIdRef.current = null;
		}
		dispatch({ type: "sync-context", chatStatus, isChatMode });
	}, [chatStatus, flushPendingChunk, isChatMode]);

	useTauriEvent("ai:tool", (payload) => {
		if (isChatMode) return;
		if (chatStatus !== "submitted" && chatStatus !== "streaming") return;
		if (
			activeToolJobIdRef.current &&
			payload.job_id !== activeToolJobIdRef.current
		)
			return;
		if (!activeToolJobIdRef.current) {
			activeToolJobIdRef.current = payload.job_id;
		}
		const tool = payload.tool?.trim() || "tool";
		const phase: ToolPhase =
			payload.phase === "call" ||
			payload.phase === "result" ||
			payload.phase === "error"
				? payload.phase
				: "call";
		dispatch({
			type: "record-tool",
			tool,
			phase,
			payload: payload.payload,
			error:
				phase === "error" ? i18n.t("shell:ai.toolFailed", { tool }) : undefined,
			at:
				typeof payload.at_ms === "number" && payload.at_ms > 0
					? payload.at_ms
					: Date.now(),
		});
	});

	useTauriEvent("ai:chunk", (payload) => {
		if (isChatMode) return;
		if (chatStatus !== "submitted" && chatStatus !== "streaming") return;
		if (
			activeToolJobIdRef.current &&
			payload.job_id !== activeToolJobIdRef.current
		)
			return;
		if (!activeToolJobIdRef.current) {
			activeToolJobIdRef.current = payload.job_id;
		}
		if (!payload.delta) return;
		pendingChunkRef.current += payload.delta;
		if (chunkFrameRef.current === null) {
			chunkFrameRef.current = window.requestAnimationFrame(flushPendingChunk);
		}
	});

	const phaseStatusText = useMemo(() => {
		if (state.responsePhase === "submitted") {
			return state.showSlowStart ? "Still thinking…" : "Thinking…";
		}
		if (state.responsePhase === "tooling") {
			return state.showSlowStart ? "Still working…" : "Working…";
		}
		if (state.responsePhase === "streaming") {
			return state.activeTools.length > 0 ? "Working…" : "Writing response…";
		}
		return "";
	}, [state.activeTools.length, state.responsePhase, state.showSlowStart]);

	const activityState = useMemo<OrbState>(() => {
		if (
			state.responsePhase === "tooling" ||
			(state.responsePhase === "streaming" && state.activeTools.length > 0)
		) {
			return "working";
		}
		if (state.responsePhase === "streaming") {
			return "composing";
		}
		return "solving";
	}, [state.activeTools.length, state.responsePhase]);

	useEffect(() => {
		clearSlowStartTimer();
		if (
			!isAwaitingResponse ||
			state.responsePhase === "idle" ||
			state.responsePhase === "streaming"
		) {
			dispatch({ type: "set-show-slow-start", showSlowStart: false });
			return;
		}
		slowStartTimerRef.current = window.setTimeout(() => {
			dispatch({ type: "set-show-slow-start", showSlowStart: true });
			slowStartTimerRef.current = null;
		}, SLOW_START_MS);
		return () => clearSlowStartTimer();
	}, [clearSlowStartTimer, isAwaitingResponse, state.responsePhase]);

	useEffect(
		() => () => {
			clearSlowStartTimer();
			clearPendingChunk();
		},
		[clearPendingChunk, clearSlowStartTimer],
	);

	const resetToolState = useCallback(() => {
		clearSlowStartTimer();
		clearPendingChunk();
		dispatch({ type: "reset-tool-state" });
		activeToolJobIdRef.current = null;
	}, [clearPendingChunk, clearSlowStartTimer]);

	const setResponsePhase = useCallback((responsePhase: ResponsePhase) => {
		dispatch({ type: "set-response-phase", responsePhase });
	}, []);

	const setActivityTimeline = useCallback(
		(activityTimeline: AIActivityTimelineEvent[]) => {
			clearPendingChunk();
			dispatch({ type: "set-activity-timeline", activityTimeline });
		},
		[clearPendingChunk],
	);

	return {
		activityTimeline: state.activityTimeline,
		setActivityTimeline,
		phaseStatusText,
		activityState,
		isAwaitingResponse,
		responsePhase: state.responsePhase,
		setResponsePhase,
		resetToolState,
	};
}
