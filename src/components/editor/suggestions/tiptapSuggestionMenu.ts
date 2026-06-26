import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import {
	type SuggestionKeyDownProps,
	type SuggestionProps,
	exitSuggestion,
} from "@tiptap/suggestion";
import { lockEditorScrollDuringSuggestion } from "../suggestionScroll";
import { clampSuggestionIndex, nextSuggestionIndex } from "./suggestionEngine";

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
}

function placeMenu(menu: HTMLElement, rect: DOMRect): void {
	const pad = 8;
	const gap = 6;
	const menuRect = menu.getBoundingClientRect();
	const placeBelowTop = rect.bottom + gap;
	const placeAboveTop = rect.top - menuRect.height - gap;
	const maxLeft = window.innerWidth - menuRect.width - pad;
	const maxTop = window.innerHeight - menuRect.height - pad;
	const nextLeft = Math.max(pad, Math.min(rect.left, maxLeft));
	const nextTop =
		placeBelowTop <= maxTop
			? placeBelowTop
			: Math.max(pad, Math.min(placeAboveTop, maxTop));
	menu.style.left = `${nextLeft}px`;
	menu.style.top = `${nextTop}px`;
}

export function createTipTapSuggestionMenu<T>({
	menuClassName,
	itemActiveClassName = "active",
	renderItem,
	lockEditorScroll = true,
	resetSelectionOnUpdate = false,
	onEscape,
}: TipTapSuggestionMenuOptions<T>) {
	let menu: HTMLDivElement | null = null;
	let selectedIndex = 0;
	let activeProps: SuggestionProps<T> | null = null;
	let unlockEditorScroll: (() => void) | null = null;

	const updateSelection = (items: T[]) => {
		if (!menu) return;
		selectedIndex = clampSuggestionIndex(selectedIndex, items.length);
		const children = Array.from(menu.children);
		children.forEach((child, index) => {
			child.classList.toggle(itemActiveClassName, index === selectedIndex);
		});
		const activeItem = children[selectedIndex];
		if (activeItem instanceof HTMLElement) {
			const menuRect = menu.getBoundingClientRect();
			const itemRect = activeItem.getBoundingClientRect();
			if (itemRect.top < menuRect.top) {
				menu.scrollTop -= menuRect.top - itemRect.top;
			} else if (itemRect.bottom > menuRect.bottom) {
				menu.scrollTop += itemRect.bottom - menuRect.bottom;
			}
		}
	};

	const updateMenu = (props: SuggestionProps<T>) => {
		if (!menu) return;
		activeProps = props;
		selectedIndex = clampSuggestionIndex(selectedIndex, props.items.length);
		menu.replaceChildren();
		menu.style.display = props.items.length ? "" : "none";
		for (const [index, item] of props.items.entries()) {
			menu.append(
				renderItem({
					item,
					index,
					isActive: index === selectedIndex,
					select: (nextItem) => props.command(nextItem),
				}),
			);
		}
		const rect = props.clientRect?.();
		if (rect && props.items.length) placeMenu(menu, rect);
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
				unlockEditorScroll = lockEditorScrollDuringSuggestion(
					props.editor as Editor,
					() => menu,
				);
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
			const current = activeProps;
			const items = current?.items ?? [];
			if (event.key === "Escape") {
				event.preventDefault();
				if (onEscape) {
					onEscape(view);
				} else {
					exitSuggestion(view);
				}
				return true;
			}
			if (!items.length) return false;
			if (event.key === "ArrowDown") {
				selectedIndex = nextSuggestionIndex(selectedIndex, items.length, 1);
				updateSelection(items);
				return true;
			}
			if (event.key === "ArrowUp") {
				selectedIndex = nextSuggestionIndex(selectedIndex, items.length, -1);
				updateSelection(items);
				return true;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				current?.command(items[selectedIndex] ?? items[0]);
				return true;
			}
			return false;
		},
		onExit: () => {
			unlockEditorScroll?.();
			unlockEditorScroll = null;
			menu?.remove();
			menu = null;
			activeProps = null;
		},
	};
}

export function exitTipTapSuggestion(view: EditorView): void {
	exitSuggestion(view);
}
