import { AnimatePresence, motion } from "motion/react";
import type { ChatMessage } from "./types";
import styles from "./ChatUI.module.css";

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
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  return (
    <motion.div
      className={styles.chatThread}
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
            variants={itemVariants}
            exit="exit"
          >
            <div className={styles.messageContent}>{m.content}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
