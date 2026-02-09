import styles from "./ChatUI.module.css";

interface ChatInputProps {
	input: string;
	setInput: React.Dispatch<React.SetStateAction<string>>;
	streaming: boolean;
	jobId: string | null;
	chatError: string;
	onSend: () => Promise<void>;
	onCancel: () => Promise<void>;
	clearChat: () => void;
}

export function ChatInput({
	input,
	setInput,
	streaming,
	jobId,
	chatError,
	onSend,
	onCancel,
	clearChat,
}: ChatInputProps) {
	return (
		<div className={styles.inputWrapper}>
			<textarea
				className={`${styles.input} ${styles.textarea}`}
				placeholder="Ask…"
				aria-label="Chat input"
				value={input}
				disabled={streaming}
				onChange={(e) => setInput(e.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						void onSend();
					}
				}}
				rows={2}
			/>
			<div className={styles.actionsBar}>
				<div className={styles.actionsLeft}>
					<button
						type="button"
						className={`${styles.buttonGhost} ${styles.buttonMinTouch}`}
						onClick={clearChat}
						disabled={streaming}
					>
						Clear
					</button>
				</div>
				<div className={styles.actionsRight}>
					{streaming ? (
						<button
							type="button"
							className={`${styles.button} ${styles.buttonDanger} ${styles.buttonMinTouch}`}
							onClick={onCancel}
							disabled={!streaming || !jobId}
						>
							Stop
						</button>
					) : (
						<button
							type="button"
							className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonMinTouch}`}
							onClick={onSend}
							disabled={streaming || !input.trim()}
						>
							Send
						</button>
					)}
				</div>
			</div>
			{chatError ? (
				<div className={`${styles.error} ${styles.alert}`} role="alert">
					<span>{chatError}</span>
					<button
						type="button"
						className={styles.errorDismiss}
						onClick={clearChat}
					>
						Dismiss
					</button>
				</div>
			) : null}
		</div>
	);
}
