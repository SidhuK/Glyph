import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../utils/cn";

type ToolPhase = "call" | "result" | "error";

export interface ToolTimelineEvent {
	id: string;
	tool: string;
	phase: ToolPhase;
	at: number;
	callId?: string;
	payload?: unknown;
	error?: string;
}

interface AIToolTimelineProps {
	events: ToolTimelineEvent[];
	streaming: boolean;
}

function formatToolName(tool: string): string {
	return tool
		.split("_")
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}

function summarizePayload(payload: unknown): string {
	if (!payload || typeof payload !== "object") return "";
	const value = payload as Record<string, unknown>;
	const query = typeof value.query === "string" ? value.query : "";
	const path = typeof value.path === "string" ? value.path : "";
	const dir = typeof value.dir === "string" ? value.dir : "";
	const results = Array.isArray(value.results) ? value.results.length : null;
	const files = Array.isArray(value.files) ? value.files.length : null;
	const relPath =
		typeof value.rel_path === "string" ? (value.rel_path as string) : "";
	const truncated = value.truncated === true;
	if (query) return `Query "${query}"`;
	if (path) return `Path "${path}"`;
	if (dir) return `Dir "${dir}"`;
	if (results != null)
		return `Found ${results} result${results === 1 ? "" : "s"}`;
	if (files != null) return `Listed ${files} item${files === 1 ? "" : "s"}`;
	if (relPath) return `${truncated ? "Read (truncated)" : "Read"} "${relPath}"`;
	return "";
}

function formatPhaseLabel(phase: ToolPhase): string {
	if (phase === "call") return "Started";
	if (phase === "result") return "Done";
	return "Failed";
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function AIToolTimeline({ events, streaming }: AIToolTimelineProps) {
	if (events.length === 0) return null;

	return (
		<motion.section
			className="aiToolTimeline"
			initial={{ opacity: 0, y: 10, scale: 0.985 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{ type: "spring", stiffness: 320, damping: 28 }}
			aria-live="polite"
			aria-label="AI tool timeline"
		>
			<div className="aiToolTimelineHeader">
				<div className="aiToolTimelineTitle">
					<span>{streaming ? "Tool activity" : "Tool log"}</span>
					{streaming ? (
						<span
							className="aiToolLiveBadge"
							aria-label="Tool call in progress"
						>
							<span className="aiToolLiveDot" />
							Live
						</span>
					) : null}
				</div>
				<span>{events.length} events</span>
			</div>
			<motion.div
				className="aiToolTimelineList"
				initial="hidden"
				animate="visible"
				variants={{
					hidden: { opacity: 0 },
					visible: {
						opacity: 1,
						transition: { staggerChildren: 0.05, delayChildren: 0.04 },
					},
				}}
			>
				<AnimatePresence initial={false}>
					{events.map((event) => {
						const summary = summarizePayload(event.payload);
						const error =
							event.phase === "error" && typeof event.error === "string"
								? event.error
								: null;
						return (
							<motion.div
								key={event.id}
								layout
								initial={{ opacity: 0, y: 8, scale: 0.99 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -6 }}
								transition={{ type: "spring", stiffness: 340, damping: 27 }}
								className={cn(
									"aiToolTimelineItem",
									event.phase === "error" && "aiToolTimelineItem-error",
									event.phase === "call" && "aiToolTimelineItem-running",
								)}
								whileHover={{ y: -1, scale: 1.004 }}
							>
								<div className="aiToolTimelineTop">
									<span
										className={cn("aiToolPhase", `aiToolPhase-${event.phase}`)}
									>
										{formatPhaseLabel(event.phase)}
									</span>
									<span className="aiToolName">
										{formatToolName(event.tool)}
									</span>
									<span className="aiToolTime">{formatTime(event.at)}</span>
								</div>
								{summary ? (
									<div className="aiToolSummary">{summary}</div>
								) : null}
								{error ? <div className="aiToolError">{error}</div> : null}
							</motion.div>
						);
					})}
				</AnimatePresence>
			</motion.div>
		</motion.section>
	);
}
