import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useTauriEvent } from "../../../lib/tauriEvents";
import type { ToolTimelineEvent } from "../AIToolTimeline";
import {
	FINALIZING_MS,
	type ResponsePhase,
	SLOW_START_MS,
	type ToolPhase,
	type ToolStatusEvent,
	formatToolName,
} from "../aiPanelConstants";
import type { RigChatStatus } from "./useRigChat";

interface UseAiToolEventsOptions {
	isChatMode: boolean;
	chatStatus: RigChatStatus;
}

type ToolState = {
	activeTools: string[];
	lastToolEvent: ToolStatusEvent | null;
	toolTimeline: ToolTimelineEvent[];
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
			type: "set-tool-timeline";
			toolTimeline: ToolTimelineEvent[];
	  }
	| {
			type: "record-tool";
			tool: string;
			phase: ToolPhase;
			error?: string;
			callId?: string | null;
			payload?: unknown;
			at: number;
	  }
	| {
			type: "record-chunk";
			delta: string;
			at: number;
	  }
	| {
			type: "finalize-complete";
	  };

const INITIAL_STATE: ToolState = {
	activeTools: [],
	lastToolEvent: null,
	toolTimeline: [],
	responsePhase: "idle",
	showSlowStart: false,
	chatStatus: "ready",
	isChatMode: false,
};

function buildTextTimelineEntry(delta: string, at: number): ToolTimelineEvent {
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
				next.lastToolEvent = null;
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
				if (state.chatStatus === "streaming") {
					next.responsePhase = "finalizing";
				} else if (state.chatStatus === "submitted") {
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
				lastToolEvent: null,
				toolTimeline: [],
			};
		case "set-response-phase":
			return { ...state, responsePhase: action.responsePhase };
		case "set-show-slow-start":
			return { ...state, showSlowStart: action.showSlowStart };
		case "set-tool-timeline":
			return { ...state, toolTimeline: action.toolTimeline };
		case "record-tool": {
			const toolEvent: ToolStatusEvent = {
				tool: action.tool,
				phase: action.phase,
				error: action.error,
			};
			return {
				...state,
				activeTools:
					action.phase === "call"
						? state.activeTools.includes(action.tool)
							? state.activeTools
							: [...state.activeTools, action.tool]
						: state.activeTools.filter((name) => name !== action.tool),
				lastToolEvent: toolEvent,
				responsePhase:
					action.phase === "call" && state.responsePhase !== "streaming"
						? "tooling"
						: state.responsePhase,
				toolTimeline: [
					...state.toolTimeline,
					{
						id: `${action.callId ?? crypto.randomUUID()}-${action.phase}-${Date.now()}`,
						kind: "tool",
						tool: action.tool,
						phase: action.phase,
						callId: action.callId ?? undefined,
						payload: action.payload,
						error: action.error,
						at: action.at,
					},
				],
			};
		}
		case "record-chunk": {
			const last = state.toolTimeline[state.toolTimeline.length - 1];
			const nextTimeline =
				last &&
				last.kind === "text" &&
				action.at - last.at <= 900 &&
				last.text.length < 6000
					? [
							...state.toolTimeline.slice(0, -1),
							{ ...last, text: `${last.text}${action.delta}`, at: action.at },
						]
					: [
							...state.toolTimeline,
							buildTextTimelineEntry(action.delta, action.at),
						];
			return {
				...state,
				showSlowStart: false,
				responsePhase: "streaming",
				toolTimeline: nextTimeline,
			};
		}
		case "finalize-complete":
			return {
				...state,
				responsePhase: "idle",
				showSlowStart: false,
			};
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
	const finalizingTimerRef = useRef<number | null>(null);

	const clearSlowStartTimer = useCallback(() => {
		if (slowStartTimerRef.current == null) return;
		window.clearTimeout(slowStartTimerRef.current);
		slowStartTimerRef.current = null;
	}, []);

	const clearFinalizingTimer = useCallback(() => {
		if (finalizingTimerRef.current == null) return;
		window.clearTimeout(finalizingTimerRef.current);
		finalizingTimerRef.current = null;
	}, []);

	const isAwaitingResponse =
		chatStatus === "submitted" || chatStatus === "streaming";

	useEffect(() => {
		if (isChatMode || chatStatus !== "streaming") {
			activeToolJobIdRef.current = null;
		}
		dispatch({ type: "sync-context", chatStatus, isChatMode });
	}, [chatStatus, isChatMode]);

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
			error: typeof payload.error === "string" ? payload.error : undefined,
			callId: payload.call_id,
			payload: payload.payload,
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
		dispatch({
			type: "record-chunk",
			delta: payload.delta,
			at: Date.now(),
		});
	});

	const toolStatusText = useMemo(() => {
		if (state.activeTools.length > 0) {
			return `Using ${state.activeTools.map(formatToolName).join(", ")}…`;
		}
		if (state.lastToolEvent?.phase === "result") {
			return `Finished ${formatToolName(state.lastToolEvent.tool)}. Writing response…`;
		}
		if (state.lastToolEvent?.phase === "error") {
			return `Tool ${formatToolName(state.lastToolEvent.tool)} failed. Continuing…`;
		}
		return "Thinking…";
	}, [state.activeTools, state.lastToolEvent]);

	const phaseStatusText = useMemo(() => {
		if (state.responsePhase === "submitted") {
			return state.showSlowStart ? "Still thinking…" : "Preparing response…";
		}
		if (state.responsePhase === "tooling") {
			return state.showSlowStart ? "Still working…" : "Working with tools…";
		}
		if (state.responsePhase === "streaming") {
			return state.activeTools.length > 0
				? toolStatusText
				: "Writing response…";
		}
		if (state.responsePhase === "finalizing") return "Finalizing…";
		return "";
	}, [
		state.activeTools.length,
		state.responsePhase,
		state.showSlowStart,
		toolStatusText,
	]);

	useEffect(() => {
		clearFinalizingTimer();
		if (state.responsePhase !== "finalizing") return;
		finalizingTimerRef.current = window.setTimeout(() => {
			dispatch({ type: "finalize-complete" });
			finalizingTimerRef.current = null;
		}, FINALIZING_MS);
		return () => clearFinalizingTimer();
	}, [clearFinalizingTimer, state.responsePhase]);

	useEffect(() => {
		clearSlowStartTimer();
		if (
			!isAwaitingResponse ||
			state.responsePhase === "idle" ||
			state.responsePhase === "streaming" ||
			state.responsePhase === "finalizing"
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
			clearFinalizingTimer();
		},
		[clearFinalizingTimer, clearSlowStartTimer],
	);

	const resetToolState = useCallback(() => {
		dispatch({ type: "reset-tool-state" });
		activeToolJobIdRef.current = null;
	}, []);

	const setResponsePhase = useCallback((responsePhase: ResponsePhase) => {
		dispatch({ type: "set-response-phase", responsePhase });
	}, []);

	const setShowSlowStart = useCallback((showSlowStart: boolean) => {
		dispatch({ type: "set-show-slow-start", showSlowStart });
	}, []);

	const setToolTimeline = useCallback((toolTimeline: ToolTimelineEvent[]) => {
		dispatch({ type: "set-tool-timeline", toolTimeline });
	}, []);

	return {
		activeTools: state.activeTools,
		lastToolEvent: state.lastToolEvent,
		toolTimeline: state.toolTimeline,
		setToolTimeline,
		toolStatusText,
		phaseStatusText,
		isAwaitingResponse,
		responsePhase: state.responsePhase,
		setResponsePhase,
		showSlowStart: state.showSlowStart,
		setShowSlowStart,
		clearSlowStartTimer,
		clearFinalizingTimer,
		resetToolState,
	};
}
