import {
	Bold,
	CheckmarkSquare02Icon,
	CodeIcon,
	Heading1,
	Heading2,
	Heading3,
	HeadingIcon,
	HighlighterIcon,
	Image01Icon,
	Italic,
	LeftToRightBlockQuoteIcon,
	LeftToRightListBulletIcon,
	LeftToRightListNumberIcon,
	ParagraphIcon,
	SeparatorHorizontalIcon,
	SourceCodeIcon,
	Strikethrough,
	TableIcon,
	TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { i18n } from "../../i18n";
import { type EditorActionId, executeEditorAction } from "./editorActions";
import { EDITOR_TEXT_COLORS, getEditorTextColorLabel } from "./textColors";
import {
	EDITOR_TEXT_HIGHLIGHTS,
	EQUALS_HIGHLIGHT_COLOR,
	getEditorTextHighlightLabel,
} from "./textHighlights";
import { getActiveTextColor, getActiveTextHighlight } from "./ribbonActiveFormat";

export interface RibbonButtonConfig {
	title: string;
	icon: IconSvgElement;
	isActive?: () => boolean;
	onClick: () => void;
	/** CSS colour for a small bar under the icon. */
	swatch?: string;
}

export interface RibbonMenuConfig {
	title: string;
	icon: IconSvgElement;
	isActive: () => boolean;
	items: RibbonButtonConfig[];
}

export interface RibbonSwatchGroup {
	title: string;
	clearTitle: string;
	activeId: string | null;
	options: {
		id: string;
		label: string;
		cssVar: string;
		fallbackHex: string;
		onSelect: () => void;
	}[];
	onClear: () => void;
}

type RunCommand = (fn: () => void) => void;
type FocusChain = () => ReturnType<Editor["chain"]>;

export interface RibbonCommandContext {
	editor: Editor;
	runCommand: RunCommand;
	focusChain: FocusChain;
}

function runAction(ctx: RibbonCommandContext, action: EditorActionId) {
	return () =>
		ctx.runCommand(() => {
			executeEditorAction({ action, editor: ctx.editor, chain: ctx.focusChain() });
		});
}

function actionButton(
	ctx: RibbonCommandContext,
	action: EditorActionId,
	title: string,
	icon: IconSvgElement,
	isActive?: () => boolean,
): RibbonButtonConfig {
	return { title, icon, isActive, onClick: runAction(ctx, action) };
}

const t = (key: string) => i18n.t(`editor:${key}`);

export function getHeadingMenu(ctx: RibbonCommandContext): RibbonMenuConfig {
	const { editor } = ctx;
	const isHeading = (level: 1 | 2 | 3) => () => editor.isActive("heading", { level });
	return {
		title: t("ribbon.heading"),
		icon: HeadingIcon,
		isActive: () => editor.isActive("heading"),
		items: [
			{
				title: t("ribbon.bodyText"),
				icon: ParagraphIcon,
				isActive: () => editor.isActive("paragraph"),
				onClick: () => ctx.runCommand(() => ctx.focusChain().setParagraph().run()),
			},
			actionButton(ctx, "heading_1", t("ribbon.heading1"), Heading1, isHeading(1)),
			actionButton(ctx, "heading_2", t("ribbon.heading2"), Heading2, isHeading(2)),
			actionButton(ctx, "heading_3", t("ribbon.heading3"), Heading3, isHeading(3)),
		],
	};
}

export function getChecklistButton(ctx: RibbonCommandContext): RibbonButtonConfig {
	return actionButton(ctx, "todo_list", t("slash.todoList.title"), CheckmarkSquare02Icon, () =>
		ctx.editor.isActive("taskList"),
	);
}

export function getListMenu(ctx: RibbonCommandContext): RibbonMenuConfig {
	const { editor } = ctx;
	return {
		title: t("ribbon.list"),
		icon: LeftToRightListBulletIcon,
		isActive: () => editor.isActive("bulletList") || editor.isActive("orderedList"),
		items: [
			actionButton(ctx, "bullet_list", t("slash.bulletList.title"), LeftToRightListBulletIcon, () =>
				editor.isActive("bulletList"),
			),
			actionButton(
				ctx,
				"numbered_list",
				t("slash.numberedList.title"),
				LeftToRightListNumberIcon,
				() => editor.isActive("orderedList"),
			),
		],
	};
}

/** The yellow highlight is a tint of this token, so the bar shows the same yellow at full strength. */
const HIGHLIGHTER_SWATCH = "var(--status-warning-fg)";

export function getFormatButtons(ctx: RibbonCommandContext): RibbonButtonConfig[] {
	const { editor } = ctx;
	const isHighlighted = () => getActiveTextHighlight(editor) !== null;
	return [
		actionButton(ctx, "bold", t("ribbon.bold"), Bold, () => editor.isActive("bold")),
		actionButton(ctx, "italic", t("ribbon.italic"), Italic, () => editor.isActive("italic")),
		{
			title: t("ribbon.highlight"),
			icon: HighlighterIcon,
			isActive: isHighlighted,
			swatch: HIGHLIGHTER_SWATCH,
			// One click marks with the colour plain `==text==` saves as; the ⋮ menu has the rest.
			onClick: () =>
				runAction(
					ctx,
					isHighlighted() ? "highlight_clear" : `highlight_${EQUALS_HIGHLIGHT_COLOR}`,
				)(),
		},
	];
}

export function getInsertButtons(ctx: RibbonCommandContext): RibbonButtonConfig[] {
	return [
		actionButton(ctx, "table", t("slash.table.title"), TableIcon),
		actionButton(ctx, "insert_image", t("slash.insertImage.title"), Image01Icon),
	];
}

/** Rows of the ⋮ menu, in sections. */
export function getOverflowSections(ctx: RibbonCommandContext): RibbonButtonConfig[][] {
	const { editor } = ctx;
	return [
		[
			actionButton(ctx, "underline", t("ribbon.underline"), TextUnderlineIcon, () =>
				editor.isActive("underline"),
			),
			actionButton(ctx, "strikethrough", t("ribbon.strikethrough"), Strikethrough, () =>
				editor.isActive("strike"),
			),
			{
				title: t("ribbon.inlineCode"),
				icon: CodeIcon,
				isActive: () => editor.isActive("code"),
				onClick: () => ctx.runCommand(() => ctx.focusChain().toggleCode().run()),
			},
		],
		[
			actionButton(ctx, "quote", t("slash.quote.title"), LeftToRightBlockQuoteIcon, () =>
				editor.isActive("blockquote"),
			),
			actionButton(ctx, "code_block", t("slash.codeBlock.title"), SourceCodeIcon, () =>
				editor.isActive("codeBlock"),
			),
			actionButton(ctx, "divider", t("slash.divider.title"), SeparatorHorizontalIcon),
		],
	];
}

export function getTextColorGroup(ctx: RibbonCommandContext): RibbonSwatchGroup {
	return {
		title: t("ribbon.textColor"),
		clearTitle: t("ribbon.clearColor"),
		activeId: getActiveTextColor(ctx.editor),
		options: EDITOR_TEXT_COLORS.map((option) => ({
			id: option.id,
			label: getEditorTextColorLabel(option.id),
			cssVar: option.cssVar,
			fallbackHex: option.fallbackHex,
			onSelect: runAction(ctx, `color_${option.id}`),
		})),
		onClear: runAction(ctx, "color_clear"),
	};
}

export function getTextHighlightGroup(ctx: RibbonCommandContext): RibbonSwatchGroup {
	return {
		title: t("ribbon.textHighlight"),
		clearTitle: t("ribbon.clearHighlight"),
		activeId: getActiveTextHighlight(ctx.editor),
		options: EDITOR_TEXT_HIGHLIGHTS.map((option) => ({
			id: option.id,
			label: getEditorTextHighlightLabel(option.id),
			// The swatch previews the tint the highlight actually applies.
			cssVar: option.backgroundCssVar,
			fallbackHex: option.backgroundFallback,
			onSelect: runAction(ctx, `highlight_${option.id}`),
		})),
		onClear: runAction(ctx, "highlight_clear"),
	};
}
