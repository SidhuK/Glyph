import { motion } from "motion/react";
import { springPresets } from "../ui/animations";
import { ToolIndicator } from "./ToolIndicator";
import styles from "./ToolIndicator.module.css";
import type { ToolExecution } from "./types";

export interface ToolIndicatorGroupProps {
	/** All tool executions for current message */
	executions: ToolExecution[];
	/** Maximum tools to show before collapsing */
	maxVisible?: number;
}

/**
 * Container for multiple concurrent tool indicators
 * Renders ToolIndicator for each tool execution
 */
export function ToolIndicatorGroup({
	executions,
	maxVisible = 5,
}: ToolIndicatorGroupProps) {
	if (executions.length === 0) {
		return null;
	}

	const visibleExecutions = executions.slice(0, maxVisible);
	const hiddenCount = executions.length - maxVisible;

	return (
		<motion.div
			className={styles.toolGroup}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={springPresets.snappy}
			aria-label="Tool executions"
		>
			{visibleExecutions.map((execution) => (
				<ToolIndicator key={execution.id} execution={execution} />
			))}
			{hiddenCount > 0 && (
				<div className={styles.hiddenCount}>+{hiddenCount} more</div>
			)}
		</motion.div>
	);
}
