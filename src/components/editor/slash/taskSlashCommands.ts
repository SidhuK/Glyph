import { Calendar03Icon, DashedLineCircleIcon, Flag02Icon } from "@hugeicons/core-free-icons";
import type { TaskFieldKind } from "../taskFields/taskFieldRequest";
import {
	type SlashCommandDef,
	type SlashCommandItem,
	localizeSlashCommandItem,
} from "./slashMenuItems";

interface TaskSlashCommand {
	kind: TaskFieldKind;
	trigger: string;
	def: Omit<SlashCommandDef, "command">;
}

const TASK_SLASH_COMMANDS: readonly TaskSlashCommand[] = [
	{
		kind: "due",
		trigger: "due",
		def: { id: "taskDue", icon: Calendar03Icon, keywords: ["due", "date", "deadline", "task"] },
	},
	{
		kind: "priority",
		trigger: "priority",
		def: { id: "taskPriority", icon: Flag02Icon, keywords: ["priority", "urgent", "task"] },
	},
	{
		kind: "status",
		trigger: "status",
		def: {
			id: "taskStatus",
			icon: DashedLineCircleIcon,
			keywords: ["status", "progress", "cancel", "task"],
		},
	},
];

function taskCommandDef({ kind, def }: TaskSlashCommand, query: string): SlashCommandDef {
	return {
		...def,
		command: ({ editor, range, onTaskFieldRequest }) => {
			editor.chain().focus().deleteRange(range).run();
			onTaskFieldRequest?.({ kind, query, pos: range.from });
		},
	};
}

export function taskSlashMenuItems(): SlashCommandItem[] {
	return TASK_SLASH_COMMANDS.map((command) =>
		localizeSlashCommandItem(taskCommandDef(command, "")),
	);
}

export function taskSlashArgumentItem(query: string): SlashCommandItem | null {
	const normalized = query.trimStart().toLowerCase();
	const command = TASK_SLASH_COMMANDS.find((candidate) =>
		normalized.startsWith(`${candidate.trigger} `),
	);
	if (!command) return null;
	const argument = query.trimStart().slice(command.trigger.length).trim();
	return localizeSlashCommandItem(taskCommandDef(command, argument));
}
