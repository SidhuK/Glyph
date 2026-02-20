import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface UseAiToolEventsOptions {
	isChatMode: boolean;
	chatStatus: string;
}

export function useAiToolEvents({
	isChatMode,
	chatStatus,
}: UseAiToolEventsOptions) {
	const [activeTools, setActiveTools] = useState<string[]>([]);
	const [lastToolEvent, setLastToolEvent] = useState<ToolStatusEvent | null>(
		null,
	);
	const [toolTimeline, setToolTimeline] = useState<ToolTimelineEvent[]>([]);
	const [responsePhase, setResponsePhase] = useState<ResponsePhase>("idle");
	const [showSlowStart, setShowSlowStart] = useState(false);

	const activeToolJobIdRef = useRef<string | null>(null);
	const slowStartTimerRef = useRef<number | null>(null);
	const finalizingTimerRef = useRef<number | null>(null);
	const prevStatusRef = useRef(chatStatus);

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
		if (chatStatus === "streaming") return;
		activeToolJobIdRef.current = null;
		setActiveTools([]);
		setLastToolEvent(null);
	}, [chatStatus]);

	useEffect(() => {
		if (!isChatMode) return;
		activeToolJobIdRef.current = null;
		setToolTimeline([]);
		setActiveTools([]);
		setLastToolEvent(null);
	}, [isChatMode]);

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
		if (phase === "call") {
			setActiveTools((prev) => (prev.includes(tool) ? prev : [...prev, tool]));
			setResponsePhase((prev) =>
				prev === "streaming" ? "streaming" : "tooling",
			);
		} else {
			setActiveTools((prev) => prev.filter((name) => name !== tool));
		}
		setLastToolEvent({
			tool,
			phase,
			error: typeof payload.error === "string" ? payload.error : undefined,
		});
		setToolTimeline((prev) => [
			...prev,
			{
				id: `${payload.call_id ?? crypto.randomUUID()}-${phase}-${Date.now()}`,
				kind: "tool",
				tool,
				phase,
				callId: payload.call_id,
				payload: payload.payload,
				error: typeof payload.error === "string" ? payload.error : undefined,
				at:
					typeof payload.at_ms === "number" && payload.at_ms > 0
						? payload.at_ms
						: Date.now(),
			},
		]);
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
		setShowSlowStart(false);
		setResponsePhase("streaming");
		setToolTimeline((prev) => {
			const at = Date.now();
			const last = prev[prev.length - 1];
			if (
				last &&
				last.kind === "text" &&
				at - last.at <= 900 &&
				last.text.length < 6000
			) {
				const merged = {
					...last,
					text: `${last.text}${payload.delta}`,
					at,
				};
				return [...prev.slice(0, -1), merged];
			}
			return [
				...prev,
				{
					id: `text-${at}-${crypto.randomUUID()}`,
					kind: "text",
					text: payload.delta,
					at,
				},
			];
		});
	});

	const toolStatusText = useMemo(() => {
		if (activeTools.length > 0) {
			return `Using ${activeTools.map(formatToolName).join(", ")}…`;
		}
		if (lastToolEvent?.phase === "result") {
			return `Finished ${formatToolName(lastToolEvent.tool)}. Writing response…`;
		}
		if (lastToolEvent?.phase === "error") {
			return `Tool ${formatToolName(lastToolEvent.tool)} failed. Continuing…`;
		}
		return "Thinking…";
	}, [activeTools, lastToolEvent]);

	const phaseStatusText = useMemo(() => {
		if (responsePhase === "submitted") {
			return showSlowStart ? "Still thinking…" : "Preparing response…";
		}
		if (responsePhase === "tooling") {
			return showSlowStart ? "Still working…" : "Working with tools…";
		}
		if (responsePhase === "streaming") {
			return activeTools.length > 0 ? toolStatusText : "Writing response…";
		}
		if (responsePhase === "finalizing") return "Finalizing…";
		return "";
	}, [activeTools.length, responsePhase, showSlowStart, toolStatusText]);

	useEffect(() => {
		const prev = prevStatusRef.current;
		if (chatStatus === "submitted" && responsePhase === "idle") {
			setShowSlowStart(false);
			setResponsePhase("submitted");
		}
		if (chatStatus === "streaming") {
			clearFinalizingTimer();
			setShowSlowStart(false);
			setResponsePhase("streaming");
		}
		if (chatStatus === "ready") {
			if (prev === "streaming") {
				clearFinalizingTimer();
				setResponsePhase("finalizing");
				finalizingTimerRef.current = window.setTimeout(() => {
					setResponsePhase("idle");
					setShowSlowStart(false);
					finalizingTimerRef.current = null;
				}, FINALIZING_MS);
			} else if (prev === "submitted") {
				setResponsePhase("idle");
				setShowSlowStart(false);
			}
		}
		if (chatStatus === "error") {
			clearSlowStartTimer();
			clearFinalizingTimer();
			setShowSlowStart(false);
			setResponsePhase("idle");
		}
		prevStatusRef.current = chatStatus;
	}, [chatStatus, clearFinalizingTimer, clearSlowStartTimer, responsePhase]);

	useEffect(() => {
		clearSlowStartTimer();
		if (
			!isAwaitingResponse ||
			responsePhase === "idle" ||
			responsePhase === "streaming" ||
			responsePhase === "finalizing"
		) {
			setShowSlowStart(false);
			return;
		}
		slowStartTimerRef.current = window.setTimeout(() => {
			setShowSlowStart(true);
			slowStartTimerRef.current = null;
		}, SLOW_START_MS);
		return () => clearSlowStartTimer();
	}, [clearSlowStartTimer, isAwaitingResponse, responsePhase]);

	useEffect(
		() => () => {
			clearSlowStartTimer();
			clearFinalizingTimer();
		},
		[clearFinalizingTimer, clearSlowStartTimer],
	);

	const resetToolState = useCallback(() => {
		setToolTimeline([]);
		setActiveTools([]);
		setLastToolEvent(null);
		activeToolJobIdRef.current = null;
	}, []);

	return {
		activeTools,
		lastToolEvent,
		toolTimeline,
		setToolTimeline,
		toolStatusText,
		phaseStatusText,
		isAwaitingResponse,
		responsePhase,
		setResponsePhase,
		showSlowStart,
		setShowSlowStart,
		clearSlowStartTimer,
		clearFinalizingTimer,
		resetToolState,
	};
}
