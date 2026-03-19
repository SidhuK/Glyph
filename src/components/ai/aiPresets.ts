import {
	Brain02Icon,
	Calendar03Icon,
	CheckListIcon,
	NoteIcon,
	TestTubeIcon,
	ToolCaseIcon,
} from "@hugeicons/core-free-icons";
import type { AiAssistantMode } from "../../lib/tauri";

export interface AiPreset {
	id: string;
	command: string;
	label: string;
	description: string;
	shortDescription: string;
	defaultMode: AiAssistantMode;
	icon: typeof Brain02Icon;
	systemPrompt: string;
}

export const AI_PRESETS: AiPreset[] = [
	{
		id: "brainstorm",
		command: "/brainstorm",
		label: "Brainstorm",
		description: "Explore ideas, patterns, and connections across your notes.",
		shortDescription: "Idea generation",
		defaultMode: "chat",
		icon: Brain02Icon,
		systemPrompt:
			"You are Glyph's brainstorming assistant. Be expansive, generative, and connective. Surface multiple ideas, patterns, angles, or structures from the user's notes. Prefer synthesis, clustering, reframing, and next-step options over final answers. Stay grounded in the provided workspace context and explicitly call out promising directions.",
	},
	{
		id: "builder",
		command: "/build",
		label: "Builder",
		description:
			"Draft, restructure, and create artifacts with minimal tool use.",
		shortDescription: "Draft and create",
		defaultMode: "create",
		icon: ToolCaseIcon,
		systemPrompt:
			"You are Glyph's builder assistant. Take action when useful, but stay disciplined. Create drafts, restructure notes, propose concrete outputs, and use the minimum number of tool calls needed. When editing or creating, optimize for clean, usable results that fit the user's workspace.",
	},
	{
		id: "tasks",
		command: "/tasks",
		label: "Task Manager",
		description: "Extract next steps, plans, and actionable checklists.",
		shortDescription: "Plan next steps",
		defaultMode: "chat",
		icon: CheckListIcon,
		systemPrompt:
			"You are Glyph's task manager assistant. Convert notes into concrete next actions, checklists, milestones, and project plans. Prefer clear sequencing, owners/placeholders, and manageable steps. Highlight blockers, dependencies, and what should happen now versus later.",
	},
	{
		id: "editor",
		command: "/edit",
		label: "Editor",
		description: "Rewrite, clarify, summarize, title, and tighten documents.",
		shortDescription: "Refine writing",
		defaultMode: "chat",
		icon: NoteIcon,
		systemPrompt:
			"You are Glyph's editor assistant. Improve clarity, structure, flow, and tone without bloating the writing. Rewrite with strong judgment, preserve intent, and offer cleaner titles, sections, summaries, or frontmatter suggestions when helpful.",
	},
	{
		id: "research",
		command: "/research",
		label: "Research",
		description:
			"Search attached context deeply and compare findings with citations.",
		shortDescription: "Search and compare",
		defaultMode: "chat",
		icon: TestTubeIcon,
		systemPrompt:
			"You are Glyph's research assistant. Search the user's approved context carefully, gather evidence, compare options, and cite the most relevant files or excerpts. Be precise about uncertainty, missing data, and tradeoffs. Favor well-supported conclusions over speculation.",
	},
	{
		id: "daily",
		command: "/daily",
		label: "Daily Notes",
		description:
			"Reflect, review, carry forward tasks, and shape a daily plan.",
		shortDescription: "Review the day",
		defaultMode: "chat",
		icon: Calendar03Icon,
		systemPrompt:
			"You are Glyph's daily notes assistant. Help the user review the day, capture wins and loose ends, carry forward unfinished tasks, and shape a calm, practical agenda. Keep outputs grounded, supportive, and easy to act on.",
	},
];

export const DEFAULT_AI_PRESET_ID = "builder";

export function getAiPresetById(id: string | null | undefined): AiPreset {
	return (
		AI_PRESETS.find((preset) => preset.id === id) ??
		AI_PRESETS.find((preset) => preset.id === DEFAULT_AI_PRESET_ID) ??
		AI_PRESETS[0]
	);
}

export function parsePresetSlashCommand(input: string): {
	preset: AiPreset;
	remainder: string;
} | null {
	const trimmed = input.trimStart();
	if (!trimmed.startsWith("/")) return null;
	const match = trimmed.match(/^\/([a-z-]+)(?:\s+(.*))?$/i);
	if (!match) return null;
	const command = `/${(match[1] ?? "").toLowerCase()}`;
	const preset = AI_PRESETS.find((item) => item.command === command);
	if (!preset) return null;
	return {
		preset,
		remainder: (match[2] ?? "").trim(),
	};
}

export function searchAiPresetCommands(input: string): AiPreset[] {
	const trimmed = input.trimStart();
	if (!trimmed.startsWith("/") || trimmed.startsWith("/add")) return [];
	const query = trimmed.slice(1).toLowerCase();
	return AI_PRESETS.filter((preset) =>
		preset.command.slice(1).toLowerCase().startsWith(query),
	);
}
