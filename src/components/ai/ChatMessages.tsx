import { AnimatePresence, motion } from "motion/react";
import styles from "./ChatUI.module.css";
import { ToolIndicatorGroup } from "./ToolIndicatorGroup";
import type { ChatMessage, ToolExecution } from "./types";

const containerVariants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
	hidden: { opacity: 0, y: 10 },
	show: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -5 },
};

interface ChatMessagesProps {
	messages: ChatMessage[];
	toolExecutions: ToolExecution[];
}

export function ChatMessages({ messages, toolExecutions }: ChatMessagesProps) {
	return (
		<motion.div
			className={styles.chatThread}
			variants={containerVariants}
			initial="hidden"
			animate="show"
		>
			<AnimatePresence mode="popLayout">
				{messages.map((m, index) => (
					<motion.div
						key={m.id}
						className={`${styles.message} ${
							m.role === "user" ? styles.messageUser : styles.messageAssistant
						}`}
						variants={itemVariants}
						exit="exit"
					>
						{/* Show tool indicators before assistant messages when tools are active */}
						{m.role === "assistant" && toolExecutions.length > 0 && (
							<ToolIndicatorGroup executions={toolExecutions} />
						)}
						<div className={styles.messageContent}>{m.content}</div>
					</motion.div>
				))}
			</AnimatePresence>
		</motion.div>
	);
}
