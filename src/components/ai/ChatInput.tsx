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
		<>
			<textarea
				className="aiChatInput"
				placeholder="Ask…"
				value={input}
				disabled={streaming}
				onChange={(e) => setInput(e.target.value)}
			/>
			<div className="aiChatActions">
				<button
					type="button"
					onClick={onSend}
					disabled={streaming || !input.trim()}
				>
					Send
				</button>
				<button
					type="button"
					onClick={onCancel}
					disabled={!streaming || !jobId}
				>
					Cancel
				</button>
				<button type="button" onClick={clearChat} disabled={streaming}>
					Clear
				</button>
			</div>
			{chatError ? <div className="aiError">{chatError}</div> : null}
		</>
	);
}
