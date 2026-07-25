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

export type AIActivityTimelineEvent = TimelineCitationEvent | TimelineTextEvent;

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
	const textEvents = events
		.filter((event): event is TimelineTextEvent => event.kind === "text")
		.sort((a, b) => a.at - b.at);
	if (textEvents.length === 0 && !streaming) return null;

	return (
		<m.div className="aiActivityTimelineInline" aria-live="polite">
			<AnimatePresence initial={false}>
				{textEvents.map((event) => (
					<m.div
						key={event.id}
						layout
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ type: "spring", stiffness: 340, damping: 27 }}
						className="aiActivityText"
					>
						<AIMessageMarkdown markdown={event.text} streaming={streaming} />
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
