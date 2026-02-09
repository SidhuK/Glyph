import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { springPresets } from "../ui/animations";
import styles from "./ToolIndicator.module.css";
import type { ToolExecution, ToolPhase } from "./types";

/** Human-readable tool names */
const TOOL_NAMES: Record<string, string> = {
	search_vault: "Search Vault",
	list_files: "List Files",
	read_file: "Read File",
};

/** Get display name for a tool */
function getToolName(tool: string): string {
	return TOOL_NAMES[tool] ?? tool;
}

/** Truncate payload for display */
function formatPayload(payload: unknown, maxLength = 200): string {
	const str =
		typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength)}...`;
}

export interface ToolIndicatorProps {
	/** Tool execution data */
	execution: ToolExecution;
	/** Whether result section starts expanded */
	defaultExpanded?: boolean;
	/** Compact mode for inline display */
	compact?: boolean;
}

/** Status icon based on phase */
function StatusIcon({ phase }: { phase: ToolPhase }) {
	switch (phase) {
		case "call":
			return (
				<motion.span
					className={styles.statusIcon}
					animate={{ rotate: 360 }}
					transition={{
						duration: 1,
						repeat: Number.POSITIVE_INFINITY,
						ease: "linear",
					}}
				>
					⟳
				</motion.span>
			);
		case "result":
			return <span className={styles.statusIcon}>✓</span>;
		case "error":
			return <span className={styles.statusIcon}>⚠</span>;
	}
}

/**
 * Individual tool execution indicator with status and collapsible result
 */
export function ToolIndicator({
	execution,
	defaultExpanded = false,
	compact = false,
}: ToolIndicatorProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);
	const hasPayload = execution.payload !== undefined;
	const hasError = execution.error !== undefined;
	const detailsId = `tool-indicator-${execution.id}`;

	return (
		<motion.div
			className={`${styles.toolIndicator} ${styles[`phase--${execution.phase}`]}`}
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={springPresets.snappy}
			data-expanded={isExpanded}
			data-compact={compact}
		>
			<button
				type="button"
				className={`${styles.toolHeader} ${styles.accordionTrigger}`}
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
				aria-controls={detailsId}
				disabled={!hasPayload && !hasError}
			>
				<StatusIcon phase={execution.phase} />
				<span className={styles.toolName}>{getToolName(execution.tool)}</span>
				<span className={styles.toolPhaseBadge}>{execution.phase}</span>
				{(hasPayload || hasError) && (
					<motion.span
						className={styles.chevron}
						animate={{ rotate: isExpanded ? 180 : 0 }}
						transition={springPresets.snappy}
					>
						▼
					</motion.span>
				)}
			</button>

			<AnimatePresence initial={false}>
				{isExpanded && (hasPayload || hasError) && (
					<motion.div
						id={detailsId}
						className={`${styles.toolPayload} ${styles.accordionContent}`}
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={springPresets.snappy}
					>
						{hasError ? (
							<pre className={`${styles.errorText} ${styles.alert}`}>
								{execution.error}
							</pre>
						) : (
							<pre>{formatPayload(execution.payload)}</pre>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
