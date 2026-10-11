import { nextSuggestionIndex } from "./suggestionEngine";

const SUBMENU_GAP = 4;
const VIEWPORT_PAD = 8;

/** The vertical strip a menu may occupy without covering the line being typed. */
export interface SuggestionMenuBand {
	top: number;
	bottom: number;
}

interface SuggestionSubmenuOptions<T> {
	className: string;
	itemActiveClassName: string;
	renderItem: (options: {
		item: T;
		index: number;
		isActive: boolean;
		select: (item: T) => void;
	}) => HTMLElement;
	onSelect: (item: T) => void;
	onPointerEnter: () => void;
}

export function highlightSuggestionItem(
	menu: HTMLElement,
	selectedIndex: number,
	activeClassName: string,
): void {
	const children = Array.from(menu.children);
	children.forEach((child, index) => {
		child.classList.toggle(activeClassName, index === selectedIndex);
	});
	const activeItem = children[selectedIndex];
	if (!(activeItem instanceof HTMLElement)) return;
	const menuRect = menu.getBoundingClientRect();
	const itemRect = activeItem.getBoundingClientRect();
	if (itemRect.top < menuRect.top) {
		menu.scrollTop -= menuRect.top - itemRect.top;
	} else if (itemRect.bottom > menuRect.bottom) {
		menu.scrollTop += itemRect.bottom - menuRect.bottom;
	}
}

/**
 * Runs `onHover` only for real pointer movement, so rows sliding under a still
 * cursor (keyboard scrolling, re-renders) do not steal the selection.
 */
export function onPointerHover(element: HTMLElement, onHover: () => void): void {
	element.addEventListener("pointermove", (event) => {
		if (event.movementX === 0 && event.movementY === 0) return;
		onHover();
	});
}

function placeSubmenu(
	submenu: HTMLElement,
	parent: HTMLElement,
	row: HTMLElement,
	band: SuggestionMenuBand,
): void {
	const rect = submenu.getBoundingClientRect();
	const height = Math.min(rect.height, Math.max(0, band.bottom - band.top));
	if (height < rect.height) submenu.style.maxHeight = `${height}px`;
	const parentRect = parent.getBoundingClientRect();
	const rowTop =
		row.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(submenu).paddingTop);
	const rightLeft = parentRect.right + SUBMENU_GAP;
	const fitsRight = rightLeft + rect.width <= window.innerWidth - VIEWPORT_PAD;
	const left = fitsRight
		? rightLeft
		: Math.max(VIEWPORT_PAD, parentRect.left - SUBMENU_GAP - rect.width);
	submenu.style.left = `${left}px`;
	submenu.style.top = `${Math.max(band.top, Math.min(rowTop, band.bottom - height))}px`;
}

/**
 * A single-level flyout beside a suggestion menu row. A hover-opened flyout leaves
 * keyboard focus in the parent menu until the pointer enters it or the user presses
 * Enter, Tab, or Right Arrow on its row.
 */
export function createSuggestionSubmenu<T>({
	className,
	itemActiveClassName,
	renderItem,
	onSelect,
	onPointerEnter,
}: SuggestionSubmenuOptions<T>) {
	let submenu: HTMLDivElement | null = null;
	let items: T[] = [];
	let selectedIndex = 0;
	let focused = false;

	const highlight = (index: number) => {
		if (!submenu) return;
		selectedIndex = index;
		highlightSuggestionItem(submenu, selectedIndex, itemActiveClassName);
	};

	const focus = () => {
		if (!submenu || focused) return;
		focused = true;
		highlight(0);
	};

	const close = () => {
		submenu?.remove();
		submenu = null;
		items = [];
		focused = false;
	};

	const open = (
		nextItems: T[],
		parent: HTMLElement,
		row: HTMLElement,
		band: SuggestionMenuBand,
		takeFocus: boolean,
	) => {
		close();
		items = nextItems;
		selectedIndex = 0;
		focused = takeFocus;
		const element = document.createElement("div");
		element.className = className;
		element.dataset.submenu = "";
		element.addEventListener("pointerenter", onPointerEnter);
		for (const [index, item] of items.entries()) {
			const itemElement = renderItem({
				item,
				index,
				isActive: takeFocus && index === 0,
				select: onSelect,
			});
			onPointerHover(itemElement, () => {
				if (focused && selectedIndex === index) return;
				focused = true;
				highlight(index);
			});
			element.append(itemElement);
		}
		submenu = element;
		document.body.append(element);
		placeSubmenu(element, parent, row, band);
	};

	const onKeyDown = (event: KeyboardEvent): boolean => {
		if (!submenu || !focused) return false;
		switch (event.key) {
			case "ArrowDown":
			case "ArrowUp":
				highlight(
					nextSuggestionIndex(selectedIndex, items.length, event.key === "ArrowDown" ? 1 : -1),
				);
				break;
			case "Enter":
			case "Tab": {
				const item = items[selectedIndex];
				if (item !== undefined) onSelect(item);
				break;
			}
			case "ArrowLeft":
			case "Escape":
				close();
				break;
			default:
				return false;
		}
		event.preventDefault();
		return true;
	};

	return { open, close, focus, onKeyDown, isOpen: () => submenu !== null };
}
