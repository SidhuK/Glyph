import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import {
	type SuggestionKeyDownProps,
	type SuggestionProps,
	exitSuggestion,
} from "@tiptap/suggestion";
import { lockEditorScrollDuringSuggestion } from "../suggestionScroll";
import { clampSuggestionIndex, nextSuggestionIndex } from "./suggestionEngine";
import {
	type SuggestionMenuBand,
	createSuggestionSubmenu,
	highlightSuggestionItem,
	onPointerHover,
} from "./suggestionSubmenu";

const MENU_PAD = 8;
const MENU_GAP = 6;
// When a submenu is open, hovering another row waits this long before switching so a
// diagonal pointer path toward the submenu can cross neighbouring rows without closing it.
const SUBMENU_HOVER_SWITCH_DELAY_MS = 200;

interface RenderTipTapSuggestionItemOptions<T> {
	item: T;
	index: number;
	isActive: boolean;
	select: (item: T) => void;
}

interface TipTapSuggestionMenuOptions<T> {
	menuClassName: string;
	itemActiveClassName?: string;
	renderItem: (options: RenderTipTapSuggestionItemOptions<T>) => HTMLElement;
	lockEditorScroll?: boolean;
	resetSelectionOnUpdate?: boolean;
	onEscape?: (view: EditorView) => void;
	onTab?: (item: T, props: SuggestionProps<T>) => void;
	onEmptyEnter?: (props: SuggestionProps<T>) => boolean;
	/** Items returned here open in a flyout submenu instead of running the command. */
	getSubmenuItems?: (item: T) => T[] | undefined;
}

interface TipTapTextSuggestionMenuOptions<T> extends Omit<
	TipTapSuggestionMenuOptions<T>,
	"renderItem"
> {
	itemContent: (item: T) => {
		title: string;
		description: string;
	};
}

function renderTextSuggestionItem<T>({
	item,
	isActive,
	select,
	itemContent,
	itemActiveClassName,
}: RenderTipTapSuggestionItemOptions<T> & {
	itemContent: TipTapTextSuggestionMenuOptions<T>["itemContent"];
	itemActiveClassName: string;
}): HTMLElement {
	const content = itemContent(item);
	const button = document.createElement("button");
	button.type = "button";
	button.className = "wikiLinkSuggestionItem";
	button.classList.toggle(itemActiveClassName, isActive);

	const title = document.createElement("span");
	title.className = "wikiLinkSuggestionTitle";
	title.textContent = content.title;

	const description = document.createElement("span");
	description.className = "wikiLinkSuggestionPath";
	description.textContent = content.description;

	button.append(title, description);
	button.addEventListener("mousedown", (event) => {
		event.preventDefault();
		select(item);
	});
	return button;
}

/**
 * Places the menu below the typed text, or above it when there is more room there,
 * shrinking it to fit so it never covers the line being typed.
 */
function placeMenu(menu: HTMLElement, rect: DOMRect): SuggestionMenuBand {
	menu.style.maxHeight = "";
	const menuRect = menu.getBoundingClientRect();
	const below = { top: rect.bottom + MENU_GAP, bottom: window.innerHeight - MENU_PAD };
	const above = { top: MENU_PAD, bottom: rect.top - MENU_GAP };
	const roomBelow = below.bottom - below.top;
	const roomAbove = above.bottom - above.top;
	const placeBelow = menuRect.height <= roomBelow || roomBelow >= roomAbove;
	const band = placeBelow ? below : above;
	const height = Math.min(menuRect.height, Math.max(0, band.bottom - band.top));
	if (height < menuRect.height) menu.style.maxHeight = `${height}px`;
	const maxLeft = window.innerWidth - menuRect.width - MENU_PAD;
	menu.style.left = `${Math.max(MENU_PAD, Math.min(rect.left, maxLeft))}px`;
	menu.style.top = `${placeBelow ? band.top : band.bottom - height}px`;
	return band;
}

export function createTipTapSuggestionMenu<T>({
	menuClassName,
	itemActiveClassName = "active",
	renderItem,
	lockEditorScroll = true,
	resetSelectionOnUpdate = false,
	onEscape,
	onTab,
	onEmptyEnter,
	getSubmenuItems,
}: TipTapSuggestionMenuOptions<T>) {
	let menu: HTMLDivElement | null = null;
	let selectedIndex = 0;
	let activeProps: SuggestionProps<T> | null = null;
	let unlockEditorScroll: (() => void) | null = null;
	let menuBand: SuggestionMenuBand | null = null;
	let submenuIndex: number | null = null;
	let hoveredIndex: number | null = null;
	let hoverSwitchTimer: number | null = null;

	const cancelHoverSwitch = () => {
		if (hoverSwitchTimer !== null) window.clearTimeout(hoverSwitchTimer);
		hoverSwitchTimer = null;
	};

	const submenu = createSuggestionSubmenu<T>({
		className: menuClassName,
		itemActiveClassName,
		renderItem,
		onSelect: (item) => activeProps?.command(item),
		onPointerEnter: () => {
			cancelHoverSwitch();
			hoveredIndex = null;
			if (submenuIndex === null) return;
			selectedIndex = submenuIndex;
			updateSelection(activeProps?.items ?? []);
		},
	});

	const updateSelection = (items: T[]) => {
		if (!menu) return;
		selectedIndex = clampSuggestionIndex(selectedIndex, items.length);
		highlightSuggestionItem(menu, selectedIndex, itemActiveClassName);
	};

	const openSubmenu = (index: number, focus: boolean): boolean => {
		const item = activeProps?.items[index];
		const children = item === undefined ? undefined : getSubmenuItems?.(item);
		const row = menu?.children[index];
		if (!menu || !menuBand || !children?.length || !(row instanceof HTMLElement)) return false;
		cancelHoverSwitch();
		selectedIndex = index;
		updateSelection(activeProps?.items ?? []);
		if (submenu.isOpen() && submenuIndex === index) {
			if (focus) submenu.focus();
			return true;
		}
		submenuIndex = index;
		submenu.open(children, menu, row, menuBand, focus);
		return true;
	};

	const closeSubmenu = () => {
		cancelHoverSwitch();
		submenu.close();
	};

	const hoverRow = (index: number) => {
		if (hoveredIndex === index) return;
		hoveredIndex = index;
		cancelHoverSwitch();
		submenu.blur();
		selectedIndex = index;
		updateSelection(activeProps?.items ?? []);
		if (!submenu.isOpen()) {
			openSubmenu(index, false);
			return;
		}
		if (submenuIndex === index) return;
		hoverSwitchTimer = window.setTimeout(() => {
			hoverSwitchTimer = null;
			if (hoveredIndex !== index) return;
			submenu.close();
			openSubmenu(index, false);
		}, SUBMENU_HOVER_SWITCH_DELAY_MS);
	};

	const updateMenu = (props: SuggestionProps<T>) => {
		if (!menu) return;
		activeProps = props;
		closeSubmenu();
		hoveredIndex = null;
		selectedIndex = clampSuggestionIndex(selectedIndex, props.items.length);
		menu.replaceChildren();
		menu.style.display = props.items.length ? "" : "none";
		for (const [index, item] of props.items.entries()) {
			const element = renderItem({
				item,
				index,
				isActive: index === selectedIndex,
				select: (nextItem) => {
					if (openSubmenu(index, true)) return;
					if (onTab) {
						onTab(nextItem, props);
						return;
					}
					props.command(nextItem);
				},
			});
			if (getSubmenuItems) onPointerHover(element, () => hoverRow(index));
			menu.append(element);
		}
		const rect = props.clientRect?.();
		if (rect && props.items.length) menuBand = placeMenu(menu, rect);
	};

	const createMenu = (props: SuggestionProps<T>) => {
		menu?.remove();
		menu = document.createElement("div");
		menu.className = menuClassName;
		document.body.append(menu);
		updateMenu(props);
	};

	return {
		onStart: (props: SuggestionProps<T>) => {
			activeProps = props;
			selectedIndex = 0;
			unlockEditorScroll?.();
			if (lockEditorScroll) {
				unlockEditorScroll = lockEditorScrollDuringSuggestion(props.editor as Editor, () => menu);
			}
			createMenu(props);
		},
		onUpdate: (props: SuggestionProps<T>) => {
			activeProps = props;
			if (resetSelectionOnUpdate) selectedIndex = 0;
			if (!menu) createMenu(props);
			updateMenu(props);
		},
		onKeyDown: ({ event, view }: SuggestionKeyDownProps) => {
			// Keyboard input can move the selection or close the flyout, so the next pointer move re-applies hover.
			hoveredIndex = null;
			if (submenu.onKeyDown(event)) return true;
			const current = activeProps;
			const items = current?.items ?? [];
			if (event.key === "Escape") {
				event.preventDefault();
				if (submenu.isOpen()) {
					closeSubmenu();
				} else if (onEscape) {
					onEscape(view);
				} else {
					exitSuggestion(view);
				}
				return true;
			}
			if (event.key === "Enter" && !items.length) {
				if (!current || !onEmptyEnter) return false;
				const handled = onEmptyEnter(current);
				if (!handled) return false;
				event.preventDefault();
				return true;
			}
			if (!items.length) return false;
			if (event.key === "ArrowDown" || event.key === "ArrowUp") closeSubmenu();
			if (event.key === "ArrowDown") {
				event.preventDefault();
				selectedIndex = nextSuggestionIndex(selectedIndex, items.length, 1);
				updateSelection(items);
				return true;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				selectedIndex = nextSuggestionIndex(selectedIndex, items.length, -1);
				updateSelection(items);
				return true;
			}
			if (
				(event.key === "Enter" || event.key === "Tab" || event.key === "ArrowRight") &&
				openSubmenu(selectedIndex, true)
			) {
				event.preventDefault();
				return true;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				current?.command(items[selectedIndex] ?? items[0]);
				return true;
			}
			if (event.key === "Tab") {
				event.preventDefault();
				if (!items.length) return false;
				const item = items[selectedIndex] ?? items[0];
				if (!item || !current) return false;
				if (onTab) {
					onTab(item, current);
					return true;
				}
				current.command(item);
				return true;
			}
			return false;
		},
		onExit: () => {
			closeSubmenu();
			unlockEditorScroll?.();
			unlockEditorScroll = null;
			menu?.remove();
			menu = null;
			activeProps = null;
		},
	};
}

export function createTipTapTextSuggestionMenu<T>({
	itemContent,
	itemActiveClassName = "active",
	...options
}: TipTapTextSuggestionMenuOptions<T>) {
	return createTipTapSuggestionMenu<T>({
		...options,
		itemActiveClassName,
		renderItem: (renderOptions) =>
			renderTextSuggestionItem({
				...renderOptions,
				itemContent,
				itemActiveClassName,
			}),
	});
}

export function exitTipTapSuggestion(view: EditorView): void {
	exitSuggestion(view);
}
