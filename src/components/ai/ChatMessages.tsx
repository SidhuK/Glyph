import type { ChatMessage } from "./types";

interface ChatMessagesProps {
	messages: ChatMessage[];
}

export function ChatMessages({ messages }: ChatMessagesProps) {
	return (
		<div className="aiChatMessages">
			{messages.map((m) => (
				<div key={m.id} className={`aiChatMsg aiChatMsg-${m.role}`}>
					<div className="aiChatRole">{m.role}</div>
					<div className="aiChatContent mono">{m.content}</div>
				</div>
			))}
		</div>
	);
}
