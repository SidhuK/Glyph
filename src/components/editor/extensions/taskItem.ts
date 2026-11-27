import {
	type JSONContent,
	type MarkdownLexerConfiguration,
	type MarkdownParseHelpers,
	type MarkdownToken,
	parseIndentedBlocks,
	renderNestedMarkdownContent,
} from "@tiptap/core";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import type { NodeType } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
	TASK_STATUS_CHAR,
	isDoneStatusChar,
	isTaskStatusChar,
} from "../../../lib/taskFields/taskStatus";
import { visitChangedNodes } from "./changedRanges";

const TASK_ITEM_PATTERN = /^([ \t]*)([-+*])[ \t]+\[([^\]\n])\](?:[ \t]+(.*))?$/u;
const TASK_LIST_START_PATTERN = /^[ \t]*[-+*][ \t]+\[[^\]\n]\](?:[ \t]|$)/mu;

function statusFromAttrs(attrs: Record<string, unknown> | undefined): string {
	const status = isTaskStatusChar(attrs?.status) ? attrs.status : TASK_STATUS_CHAR.todo;
	const checked = attrs?.checked === true;
	if (checked === isDoneStatusChar(status)) return status;
	return checked ? TASK_STATUS_CHAR.done : TASK_STATUS_CHAR.todo;
}

function tokenStatus(token: MarkdownToken): string {
	const status: unknown = token.status;
	return isTaskStatusChar(status) ? status : TASK_STATUS_CHAR.todo;
}

function tokenizeTaskList(src: string, lexer: MarkdownLexerConfiguration): MarkdownToken[] {
	const result = parseTaskItems(src, lexer);
	if (!result) return lexer.blockTokens(src);
	const taskList = { type: "taskList", raw: result.raw, items: result.items };
	const remainder = src.slice(result.raw.length);
	return remainder.trim() ? [taskList, ...lexer.blockTokens(remainder)] : [taskList];
}

function parseTaskItems(src: string, lexer: MarkdownLexerConfiguration) {
	return parseIndentedBlocks(
		src,
		{
			itemPattern: TASK_ITEM_PATTERN,
			extractItemData: (match) => ({
				indentLevel: match[1].length,
				mainContent: match[4] ?? "",
				status: match[3],
			}),
			createToken: (
				data: { mainContent: string; indentLevel: number; status: string },
				nested,
			) => ({
				type: "taskItem",
				raw: "",
				mainContent: data.mainContent,
				indentLevel: data.indentLevel,
				status: data.status,
				checked: isDoneStatusChar(data.status),
				text: data.mainContent,
				tokens: lexer.inlineTokens(data.mainContent),
				nestedTokens: nested,
			}),
			customNestedParser: (content) => tokenizeTaskList(content, lexer),
		},
		lexer,
	);
}

export const GlyphTaskList = TaskList.extend({
	markdownTokenizer: {
		name: "taskList",
		level: "block",
		start: (src) => src.match(TASK_LIST_START_PATTERN)?.index ?? -1,
		tokenize: (src, _tokens, lexer) => {
			const result = parseTaskItems(src, lexer);
			return result ? { type: "taskList", raw: result.raw, items: result.items } : undefined;
		},
	},
});

function taskItemContent(token: MarkdownToken, h: MarkdownParseHelpers): JSONContent[] {
	const inline = token.tokens?.length
		? h.parseInline(token.tokens)
		: token.text
			? [h.createTextNode(token.text)]
			: [];
	const nested: unknown = token.nestedTokens;
	const nestedContent = Array.isArray(nested) && nested.length ? h.parseChildren(nested) : [];
	return [h.createNode("paragraph", {}, inline), ...nestedContent];
}

function taskStatusSyncPlugin(taskItemType: NodeType): Plugin {
	return new Plugin({
		key: new PluginKey("glyph-task-status-sync"),
		appendTransaction(transactions, _oldState, newState) {
			if (!transactions.some((transaction) => transaction.docChanged)) return null;
			const tr = newState.tr;
			visitChangedNodes(transactions, newState, (node, pos) => {
				if (node.type !== taskItemType) return;
				const status = statusFromAttrs(node.attrs);
				if (status !== node.attrs.status) tr.setNodeAttribute(pos, "status", status);
			});
			return tr.docChanged ? tr : null;
		},
	});
}

export const GlyphTaskItem = TaskItem.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			status: {
				default: TASK_STATUS_CHAR.todo,
				keepOnSplit: false,
				parseHTML: (element: HTMLElement) => {
					const status = element.getAttribute("data-status");
					if (isTaskStatusChar(status)) return status;
					return element.getAttribute("data-checked") === "true"
						? TASK_STATUS_CHAR.done
						: TASK_STATUS_CHAR.todo;
				},
				renderHTML: (attributes: Record<string, unknown>) => ({
					"data-status": statusFromAttrs(attributes),
				}),
			},
		};
	},
	parseMarkdown: (token, h) => {
		const status = tokenStatus(token);
		return h.createNode(
			"taskItem",
			{ checked: isDoneStatusChar(status), status },
			taskItemContent(token, h),
		);
	},
	renderMarkdown: (node, h) =>
		renderNestedMarkdownContent(node, h, `- [${statusFromAttrs(node.attrs)}] `),
	addProseMirrorPlugins() {
		return [...(this.parent?.() ?? []), taskStatusSyncPlugin(this.type)];
	},
}).configure({ nested: true });
