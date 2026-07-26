import { AiBrain04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "../Icons";
import { AIChatThread } from "../ai/AIChatThread";
import { AIComposer } from "../ai/AIComposer";
import { messageText } from "../ai/aiPanelConstants";
import { useRigChat } from "../ai/hooks/useRigChat";
import { useAiContext } from "../ai/useAiContext";
import { useAiProfiles } from "../ai/useAiProfiles";
import { Button } from "../ui/shadcn/button";
import { preprocessMarkdownForEditor } from "./markdown/wikiLinkMarkdownBridge";

export interface InlineAISelection {
	from: number;
	to: number;
	text: string;
}

interface InlineAIEditorProps {
	editor: Editor;
	selection: InlineAISelection;
	onClose: () => void;
}

function parseMarkdown(
	editor: Editor,
	markdown: string,
	unwrapSingleParagraph: boolean,
): JSONContent[] {
	const manager = new MarkdownManager({
		extensions: editor.extensionManager.extensions,
		markedOptions: {
			gfm: true,
			breaks: false,
		},
	});
	const parsed = manager.parse(preprocessMarkdownForEditor(markdown));
	const content = Array.isArray(parsed.content) ? parsed.content : [];
	if (
		unwrapSingleParagraph &&
		content.length === 1 &&
		content[0]?.type === "paragraph"
	) {
		return Array.isArray(content[0].content) ? content[0].content : [];
	}
	return content;
}

function selectionSystemPrompt(text: string): string {
	return [
		"You are helping with one selected passage from a note.",
		"Use only the selected passage and this conversation as note context.",
		"Answer questions normally. For rewrite, rephrase, or summary requests, return only the text that should be inserted into the note, without a preamble.",
		"",
		"<selected_passage>",
		text,
		"</selected_passage>",
	].join("\n");
}

const ignoreThreadAction = () => {};

export function InlineAIEditor({
	editor,
	selection,
	onClose,
}: InlineAIEditorProps) {
	const { t } = useTranslation("editor");
	const [input, setInput] = useState("");
	const [applyError, setApplyError] = useState("");
	const chat = useRigChat();
	const profiles = useAiProfiles();
	const context = useAiContext("", false);
	const composerInputRef = useRef<HTMLDivElement | null>(null);
	const isAwaiting = chat.status === "submitted" || chat.status === "streaming";
	const latestAssistantText = useMemo(() => {
		for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
			const message = chat.messages[index];
			if (message?.role === "assistant") return messageText(message).trim();
		}
		return "";
	}, [chat.messages]);
	const scheduleComposerInputResize = useCallback(() => {
		window.requestAnimationFrame(() => {
			const element = composerInputRef.current;
			if (!element) return;
			element.style.height = "0px";
			const nextHeight = Math.max(40, Math.min(element.scrollHeight, 120));
			element.style.height = `${nextHeight.toString()}px`;
			element.style.overflowY = element.scrollHeight > 120 ? "auto" : "hidden";
		});
	}, []);

	const send = (text: string) => {
		const prompt = text.trim();
		if (!prompt || isAwaiting || !profiles.activeProfileId) return;
		setInput("");
		setApplyError("");
		void chat.sendMessage(
			{ text: prompt },
			{
				body: {
					profile_id: profiles.activeProfileId,
					mode: "chat",
					system_prompt: selectionSystemPrompt(selection.text),
					audit: true,
				},
			},
		);
	};

	const applyResponse = (mode: "replace" | "insert") => {
		if (!latestAssistantText || editor.isDestroyed || !editor.isEditable) {
			setApplyError(t("inlineAi.applyFailed"));
			return;
		}
		const docEnd = editor.state.doc.content.size;
		const currentSelectionText =
			selection.from >= 0 && selection.to <= docEnd
				? editor.state.doc
						.textBetween(selection.from, selection.to, "\n")
						.trim()
				: "";
		if (currentSelectionText !== selection.text) {
			setApplyError(t("inlineAi.selectionChanged"));
			return;
		}
		try {
			const content = parseMarkdown(
				editor,
				latestAssistantText,
				mode === "replace",
			);
			if (!content.length) {
				setApplyError(t("inlineAi.applyFailed"));
				return;
			}
			const resolvedEnd = editor.state.doc.resolve(selection.to);
			const range =
				mode === "replace"
					? { from: selection.from, to: selection.to }
					: resolvedEnd.depth > 0
						? resolvedEnd.after(1)
						: selection.to;
			const applied = editor
				.chain()
				.focus(undefined, { scrollIntoView: false })
				.insertContentAt(range, content)
				.run();
			if (applied) {
				onClose();
				return;
			}
		} catch {
			setApplyError(t("inlineAi.applyFailed"));
			return;
		}
		setApplyError(t("inlineAi.applyFailed"));
	};

	return (
		<dialog
			open
			className="inlineAiEditor nodrag nopan nowheel"
			aria-label={t("inlineAi.title")}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") onClose();
			}}
		>
			<div className="inlineAiHeader">
				<div className="inlineAiTitle">
					<HugeiconsIcon
						icon={AiBrain04Icon}
						size="var(--icon-md)"
						strokeWidth={0.9}
					/>
					<span>{t("inlineAi.title")}</span>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onClose}
					aria-label={t("inlineAi.close")}
					title={t("inlineAi.close")}
				>
					<X size="var(--icon-sm)" />
				</Button>
			</div>
			<div className="inlineAiSelection">{selection.text}</div>
			<div className="inlineAiThread" aria-live="polite">
				{chat.messages.length === 0 ? (
					<div className="inlineAiQuickActions">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => send(t("inlineAi.summarizePrompt"))}
						>
							{t("inlineAi.summarize")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => send(t("inlineAi.rephrasePrompt"))}
						>
							{t("inlineAi.rephrase")}
						</Button>
					</div>
				) : (
					<AIChatThread
						messages={chat.messages}
						isChatMode
						isAwaitingResponse={isAwaiting}
						chatStatus={chat.status}
						phaseStatusText={t("inlineAi.thinking")}
						activityState="shaping"
						showIdleActivity={false}
						activityTimeline={[]}
						onCopy={ignoreThreadAction}
						onSave={ignoreThreadAction}
						onRetry={ignoreThreadAction}
						showAssistantActions={false}
					/>
				)}
			</div>
			{chat.error ? (
				<div className="aiPanelError">{chat.error.message}</div>
			) : null}
			{profiles.error ? (
				<div className="aiPanelError">{profiles.error}</div>
			) : null}
			{applyError ? <div className="aiPanelError">{applyError}</div> : null}
			{latestAssistantText && !isAwaiting ? (
				<div className="inlineAiApplyActions">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => applyResponse("replace")}
					>
						{t("inlineAi.replace")}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => applyResponse("insert")}
					>
						{t("inlineAi.insertBelow")}
					</Button>
				</div>
			) : null}
			<AIComposer
				input={input}
				setInput={setInput}
				isAwaitingResponse={isAwaiting}
				isStreamingResponse={chat.status === "streaming"}
				canSend={
					Boolean(input.trim()) &&
					Boolean(profiles.activeProfileId) &&
					!isAwaiting
				}
				onSend={() => send(input)}
				onStop={chat.stop}
				composerInputRef={composerInputRef}
				scheduleComposerInputResize={scheduleComposerInputResize}
				profiles={profiles}
				context={context}
				activeFilePath={null}
				showAddPanel={false}
				panelQuery=""
				addPanelOpen={false}
				setAddPanelOpen={ignoreThreadAction}
				setAddPanelQuery={ignoreThreadAction}
				onAddContext={context.addContext}
				onRemoveContext={context.removeContext}
				allowContext={false}
				autoFocus
				inputLabel={t("inlineAi.placeholder")}
				placeholder={t("inlineAi.placeholder")}
				sendLabel={t("inlineAi.send")}
				stopLabel={t("inlineAi.stop")}
			/>
		</dialog>
	);
}
