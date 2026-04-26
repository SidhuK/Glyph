import type { UIMessage } from "./hooks/useRigChat";

type AddTrigger = { start: number; query: string };
export type ToolPhase = "call" | "result" | "error";
export type ResponsePhase =
	| "idle"
	| "submitted"
	| "tooling"
	| "streaming"
	| "finalizing";

export interface ToolStatusEvent {
	tool: string;
	phase: ToolPhase;
	error?: string;
}

export function messageText(message: UIMessage): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text)
		.join("");
}

export function parseAddTrigger(input: string): AddTrigger | null {
	const addMatch = input.match(/(?:^|\s)\/add\s*([\w\-./ ]*)$/);
	if (addMatch) {
		const idx = input.lastIndexOf("/add");
		return { start: idx, query: (addMatch[1] ?? "").trim() };
	}
	const atMatch = input.match(/(?:^|\s)@([\w\-./ ]*)$/);
	if (atMatch) {
		const idx = input.lastIndexOf("@");
		return { start: idx, query: (atMatch[1] ?? "").trim() };
	}
	return null;
}

export function formatToolName(tool: string): string {
	return tool
		.split("_")
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}

export const SLOW_START_MS = 3000;
export const FINALIZING_MS = 280;
