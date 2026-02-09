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
			className={`${styles.chatThread} ${styles.scrollArea}`}
			role="log"
			aria-live="polite"
			aria-relevant="additions text"
			variants={containerVariants}
			initial="hidden"
			animate="show"
		>
			<AnimatePresence mode="popLayout">
				{messages.map((m) => (
					<motion.div
						key={m.id}
						className={`${styles.message} ${
							m.role === "user" ? styles.messageUser : styles.messageAssistant
						}`}
						aria-label={
							m.role === "user" ? "User message" : "Assistant message"
						}
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
