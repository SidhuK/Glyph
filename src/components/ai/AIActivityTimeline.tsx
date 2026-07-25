import { AnimatePresence, m } from "motion/react";
import { type OrbState, ThinkingOrb } from "thinking-orbs";
import { AIMessageMarkdown } from "./AIMessageMarkdown";

interface TimelineCitationEvent {
	kind: "citation";
	payload?: unknown;
}

interface TimelineTextEvent {
	id: string;
	kind: "text";
	text: string;
	at: number;
}

interface TimelineErrorEvent {
	id: string;
	kind: "error";
	message: string;
	at: number;
}

export type AIActivityTimelineEvent =
	| TimelineCitationEvent
	| TimelineTextEvent
	| TimelineErrorEvent;

interface AIActivityTimelineProps {
	events: AIActivityTimelineEvent[];
	streaming: boolean;
	activityState: OrbState;
	statusText: string;
}

export function AIActivityTimeline({
	events,
	streaming,
	activityState,
	statusText,
}: AIActivityTimelineProps) {
	const visibleEvents = events
		.filter((event) => event.kind !== "citation")
		.sort((a, b) => a.at - b.at);
	if (visibleEvents.length === 0 && !streaming) return null;

	return (
		<m.div className="aiActivityTimelineInline" aria-live="polite">
			<AnimatePresence initial={false}>
				{visibleEvents.map((event) => (
					<m.div
						key={event.id}
						layout
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ type: "spring", stiffness: 340, damping: 27 }}
						className={
							event.kind === "text" ? "aiActivityText" : "aiInlineError"
						}
					>
						{event.kind === "text" ? (
							<AIMessageMarkdown markdown={event.text} streaming={streaming} />
						) : (
							<>
								<span className="aiInlineErrorDot" />
								<span className="aiInlineErrorText">{event.message}</span>
							</>
						)}
					</m.div>
				))}
			</AnimatePresence>
			{streaming ? (
				<div className="aiActivity">
					<ThinkingOrb
						state={activityState}
						size={20}
						aria-label={statusText}
					/>
					<span>{statusText}</span>
				</div>
			) : null}
		</m.div>
	);
}
