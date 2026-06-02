import { ArrowUp02Icon, AtIcon, StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	type Dispatch,
	type ClipboardEvent as ReactClipboardEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type RefObject,
	type SetStateAction,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { APP_TAGLINE } from "../../lib/copy";
import { normalizeRelPath } from "../../utils/path";
import { File, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { ModelSelector } from "./ModelSelector";
import { truncateLabel } from "./modelSelectorConstants";
import type { useAiContext } from "./useAiContext";
import type { useAiProfiles } from "./useAiProfiles";

const CHIP_OPEN = "\uE000";
const CHIP_CLOSE = "\uE001";
const CHIP_RE = new RegExp(
	`${CHIP_OPEN}(file|folder)([^${CHIP_CLOSE}]*)${CHIP_CLOSE}`,
	"g",
);

function fileNameFromPath(path: string): string {
	const parts = path.split(/[\\/]/).filter(Boolean);
	return parts.length ? parts[parts.length - 1] : path;
}

function makeChipMarker(kind: "file" | "folder", path: string): string {
	return `${CHIP_OPEN}${kind}${path}${CHIP_CLOSE}`;
}

function chipLabelFor(kind: "file" | "folder", path: string): string {
	return kind === "file" ? fileNameFromPath(path) : path || "Space";
}

interface AIComposerProps {
	input: string;
	setInput: Dispatch<SetStateAction<string>>;
	isAwaitingResponse: boolean;
	canSend: boolean;
	onSend: () => void;
	onStop: () => void;
	composerInputRef: RefObject<HTMLDivElement | null>;
	scheduleComposerInputResize: () => void;
	profiles: ReturnType<typeof useAiProfiles>;
	context: ReturnType<typeof useAiContext>;
	activeFilePath: string | null;
	showAddPanel: boolean;
	panelQuery: string;
	addPanelOpen: boolean;
	setAddPanelOpen: (open: boolean) => void;
	setAddPanelQuery: (query: string) => void;
	onAddContext: (kind: "folder" | "file", path: string) => void;
	onRemoveContext: (kind: "folder" | "file", path: string) => void;
}

function readCaretOffset(el: HTMLElement): number | null {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	if (!el.contains(range.startContainer)) return null;
	const pre = range.cloneRange();
	pre.selectNodeContents(el);
	pre.setEnd(range.startContainer, range.startOffset);
	return pre.toString().length;
}

function setCaretOffset(el: HTMLElement, offset: number): void {
	const selection = window.getSelection();
	if (!selection) return;
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	let remaining = offset;
	let target: Text | null = null;
	let targetOffset = 0;
	const skippedChips = new Set<HTMLElement>();
	let node: Node | null = walker.nextNode();
	while (node) {
		const chip = nonEditableChipFor(node, el);
		if (chip) {
			if (!skippedChips.has(chip)) {
				skippedChips.add(chip);
				const chipLength = chip.textContent?.length ?? 0;
				if (remaining <= chipLength) {
					setCaretAtElementBoundary(selection, chip, remaining > 0);
					return;
				}
				remaining -= chipLength;
			}
			node = walker.nextNode();
			continue;
		}
		const length = node.nodeValue?.length ?? 0;
		if (remaining <= length) {
			target = node as Text;
			targetOffset = remaining;
			break;
		}
		remaining -= length;
		node = walker.nextNode();
	}
	if (!target) {
		const range = document.createRange();
		range.setStart(el, el.childNodes.length);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
		return;
	}
	const range = document.createRange();
	range.setStart(target, Math.min(targetOffset, target.nodeValue?.length ?? 0));
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

function nonEditableChipFor(node: Node, root: HTMLElement): HTMLElement | null {
	let element = node.parentElement;
	let nonEditable: HTMLElement | null = null;
	while (element && element !== root) {
		if (
			element.dataset.chipKind === "file" ||
			element.dataset.chipKind === "folder"
		) {
			return element;
		}
		if (element.isContentEditable === false) nonEditable = element;
		element = element.parentElement;
	}
	return nonEditable;
}

function setCaretAtElementBoundary(
	selection: Selection,
	element: HTMLElement,
	after: boolean,
): void {
	const parent = element.parentNode;
	if (!parent) return;
	const index = Array.from(parent.childNodes).indexOf(element);
	if (index === -1) return;
	const range = document.createRange();
	range.setStart(parent, index + (after ? 1 : 0));
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

function lineBreakFor(result: string): string {
	return result && !result.endsWith("\n") ? "\n" : "";
}

const BLOCK_TAGS = new Set([
	"DIV",
	"P",
	"LI",
	"PRE",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"UL",
	"OL",
]);

function domNodeToInput(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
	if (node.nodeType !== Node.ELEMENT_NODE) return "";

	const element = node as HTMLElement;
	const kind = element.dataset.chipKind;
	const path = element.dataset.chipPath;
	if (kind === "file" || kind === "folder") {
		return typeof path === "string" ? makeChipMarker(kind, path) : "";
	}
	if (element.tagName === "BR") return "\n";

	let result = "";
	for (const child of Array.from(element.childNodes)) {
		result += domNodeToInput(child);
	}
	if (BLOCK_TAGS.has(element.tagName)) {
		result += lineBreakFor(result);
	}
	return result;
}

function domToInput(el: HTMLElement): string {
	let result = "";
	for (const child of Array.from(el.childNodes)) {
		result += domNodeToInput(child);
	}
	return result;
}

function insertPlainTextAtSelection(el: HTMLElement, text: string): void {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) {
		el.appendChild(document.createTextNode(text));
		setCaretOffset(el, el.textContent?.length ?? 0);
		return;
	}

	const range = selection.getRangeAt(0);
	if (!el.contains(range.commonAncestorContainer)) {
		el.appendChild(document.createTextNode(text));
		setCaretOffset(el, el.textContent?.length ?? 0);
		return;
	}

	range.deleteContents();
	const textNode = document.createTextNode(text);
	range.insertNode(textNode);
	range.setStartAfter(textNode);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

export function AIComposer({
	input,
	setInput,
	isAwaitingResponse,
	canSend,
	onSend,
	onStop,
	composerInputRef,
	scheduleComposerInputResize,
	profiles,
	context,
	activeFilePath,
	showAddPanel,
	panelQuery,
	addPanelOpen,
	setAddPanelOpen,
	setAddPanelQuery,
	onAddContext,
	onRemoveContext,
}: AIComposerProps) {
	const handleInsertMentionTrigger = useCallback(() => {
		if (isAwaitingResponse) return;
		setInput((prev) => {
			const trimmedEnd = prev.replace(/\s+$/, "");
			if (!trimmedEnd) return "@";
			if (/(?:^|\s)@[\w\-./ ]*$/.test(prev)) return prev;
			return /\s$/.test(prev) ? `${prev}@` : `${prev} @`;
		});
		scheduleComposerInputResize();
		window.requestAnimationFrame(() => composerInputRef.current?.focus());
	}, [
		isAwaitingResponse,
		setInput,
		scheduleComposerInputResize,
		composerInputRef,
	]);

	const suggestedFilePath = activeFilePath
		? normalizeRelPath(activeFilePath)
		: "";
	const showActiveFileSuggestion =
		Boolean(suggestedFilePath) &&
		!context.hasContext("file", suggestedFilePath);

	const renderSegments = useMemo(() => {
		const segments: Array<
			| { type: "text"; value: string }
			| {
					type: "chip";
					key: string;
					kind: "file" | "folder";
					path: string;
					label: string;
			  }
		> = [];
		let cursor = 0;
		CHIP_RE.lastIndex = 0;
		for (const match of input.matchAll(CHIP_RE)) {
			if (match.index > cursor) {
				segments.push({
					type: "text",
					value: input.slice(cursor, match.index),
				});
			}
			const kind = match[1] as "file" | "folder";
			const path = match[2];
			segments.push({
				type: "chip",
				key: `${kind}:${path}`,
				kind,
				path,
				label: chipLabelFor(kind, path),
			});
			cursor = match.index + match[0].length;
		}
		if (cursor < input.length) {
			segments.push({ type: "text", value: input.slice(cursor) });
		}
		return segments;
	}, [input]);

	const lastInputRef = useRef(input);
	const isUserInputRef = useRef(false);

	useLayoutEffect(() => {
		const el = composerInputRef.current;
		if (!el) return;
		if (isUserInputRef.current) {
			isUserInputRef.current = false;
			lastInputRef.current = input;
			return;
		}
		if (lastInputRef.current === input) return;
		lastInputRef.current = input;
		const caret = readCaretOffset(el);
		el.innerHTML = "";
		for (const seg of renderSegments) {
			if (seg.type === "text") {
				el.appendChild(document.createTextNode(seg.value));
			} else {
				const chip = document.createElement("span");
				chip.className = "aiComposerInlineChip";
				chip.contentEditable = "false";
				chip.dataset.chipKind = seg.kind;
				chip.dataset.chipPath = seg.path;
				const icon = document.createElement("span");
				icon.className = "aiComposerInlineChipIcon";
				icon.innerHTML =
					seg.kind === "file"
						? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7L16 7"/><path d="M8 11L12 11"/><path d="M13 21.5V21C13 18.1716 13 16.7574 13.8787 15.8787C14.7574 15 16.1716 15 19 15H19.5M20 13.3431V10C20 6.22876 20 4.34315 18.8284 3.17157C17.6569 2 15.7712 2 12 2C8.22877 2 6.34315 2 5.17157 3.17157C4 4.34314 4 6.22876 4 10L4 14.5442C4 17.7892 4 19.4117 4.88607 20.5107C5.06508 20.7327 5.26731 20.9349 5.48933 21.1139C6.58831 22 8.21082 22 11.4558 22C12.1614 22 12.5141 22 12.8372 21.886C12.9044 21.8623 12.9702 21.835 13.0345 21.8043C13.3436 21.6564 13.593 21.407 14.0919 20.9081L18.8284 16.1716C19.4065 15.5935 19.6955 15.3045 19.8478 14.9369C20 14.5694 20 14.1606 20 13.3431Z"/></svg>'
						: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7H16.75C18.8567 7 19.91 7 20.6667 7.50559C20.9943 7.72447 21.2755 8.00572 21.4944 8.33329C22 9.08996 22 10.1433 22 12.25C22 15.7612 22 17.5167 21.1573 18.7779C20.7926 19.3238 20.3238 19.7926 19.7779 20.1573C18.5167 21 16.7612 21 13.25 21H12C7.28595 21 4.92893 21 3.46447 19.5355C2 18.0711 2 15.714 2 11V7.94427C2 6.1278 2 5.21956 2.38032 4.53806C2.65142 4.05227 3.05227 3.65142 3.53806 3.38032C4.21956 3 5.1278 3 6.94427 3C8.10802 3 8.6899 3 9.19926 3.19101C10.3622 3.62712 10.8418 4.68358 11.3666 5.73313L12 7"/></svg>';
				chip.appendChild(icon);
				const label = document.createElement("span");
				label.className = "aiComposerInlineChipLabel";
				label.textContent = truncateLabel(seg.label, 28);
				chip.appendChild(label);
				const close = document.createElement("span");
				close.className = "aiComposerInlineChipClose";
				close.contentEditable = "false";
				close.setAttribute("role", "button");
				close.setAttribute("aria-label", `Remove ${seg.label}`);
				close.dataset.removeKind = seg.kind;
				close.dataset.removePath = seg.path;
				close.textContent = "\u00D7";
				chip.appendChild(close);
				el.appendChild(chip);
			}
		}
		if (caret !== null) setCaretOffset(el, caret);
		scheduleComposerInputResize();
	}, [input, renderSegments, composerInputRef, scheduleComposerInputResize]);

	const handleInput = useCallback(() => {
		const el = composerInputRef.current;
		if (!el) return;
		isUserInputRef.current = true;
		const next = domToInput(el);
		if (next !== input) setInput(next);
		scheduleComposerInputResize();
	}, [composerInputRef, input, setInput, scheduleComposerInputResize]);

	const handlePaste = useCallback(
		(event: ReactClipboardEvent<HTMLDivElement>) => {
			const el = composerInputRef.current;
			if (!el) return;
			const text = event.clipboardData.getData("text/plain");
			if (!text) return;
			event.preventDefault();
			insertPlainTextAtSelection(el, text);
			isUserInputRef.current = true;
			const next = domToInput(el);
			if (next !== input) setInput(next);
			scheduleComposerInputResize();
		},
		[composerInputRef, input, setInput, scheduleComposerInputResize],
	);

	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			const target = event.target as HTMLElement;
			const close = target.closest<HTMLElement>("[data-remove-kind]");
			if (close) {
				event.preventDefault();
				const kind = close.dataset.removeKind as "file" | "folder" | undefined;
				const path = close.dataset.removePath ?? "";
				if (kind === "file" || kind === "folder") {
					onRemoveContext(kind, path);
				}
				return;
			}
			const chip = target.closest<HTMLElement>("[data-chip-kind]");
			if (chip) {
				event.preventDefault();
				const kind = chip.dataset.chipKind as "file" | "folder" | undefined;
				const path = chip.dataset.chipPath ?? "";
				if (kind === "file" || kind === "folder") {
					onRemoveContext(kind, path);
				}
			}
		},
		[onRemoveContext],
	);

	const handleKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (
				event.key === "Enter" &&
				!event.shiftKey &&
				!event.metaKey &&
				!event.ctrlKey
			) {
				if (event.nativeEvent.isComposing || !canSend) return;
				event.preventDefault();
				onSend();
			}
		},
		[canSend, onSend],
	);

	return (
		<>
			{showAddPanel ? (
				<div className="aiAddPanel">
					<input
						type="search"
						className="aiAddPanelInput"
						placeholder="Search files & folders…"
						value={panelQuery}
						onChange={(e) => {
							if (!addPanelOpen) setAddPanelOpen(true);
							setAddPanelQuery(e.target.value);
						}}
					/>
					{context.folderIndexError ? (
						<div className="aiPanelError">{context.folderIndexError}</div>
					) : null}
					<div className="aiAddPanelList">
						{context.visibleSuggestions.length ? (
							context.visibleSuggestions.map((item) => (
								<button
									key={`${item.kind}:${item.path || "space"}`}
									type="button"
									className="aiAddPanelItem"
									onClick={() => onAddContext(item.kind, item.path)}
								>
									<span>{item.label || "Space"}</span>
								</button>
							))
						) : (
							<div className="aiAddPanelEmpty">
								{panelQuery.trim()
									? "No results"
									: "Type to search files & folders"}
							</div>
						)}
					</div>
					<button
						type="button"
						className="aiAddPanelClose"
						onClick={() => setAddPanelOpen(false)}
					>
						<X size={11} />
					</button>
				</div>
			) : null}
			<div className="aiComposer">
				<div className="aiComposerInputShell">
					{showActiveFileSuggestion ? (
						<div className="aiComposerSuggestionHint" aria-label="Active file">
							<button
								type="button"
								className="aiComposerSuggestionButton"
								onClick={() => onAddContext("file", suggestedFilePath)}
								aria-label={`Add ${fileNameFromPath(suggestedFilePath)} to context`}
								title={`Add ${suggestedFilePath} to context`}
								disabled={isAwaitingResponse}
							>
								<span className="aiComposerSuggestionIcon">
									<File size={12} />
								</span>
								<span className="aiComposerSuggestionLabel">
									{truncateLabel(fileNameFromPath(suggestedFilePath), 28)}
								</span>
							</button>
						</div>
					) : null}
					<div
						ref={composerInputRef}
						className="aiComposerInput"
						contentEditable={!isAwaitingResponse}
						suppressContentEditableWarning
						role="textbox"
						tabIndex={0}
						aria-multiline="true"
						aria-label="Message"
						data-placeholder={APP_TAGLINE}
						spellCheck
						onInput={handleInput}
						onPaste={handlePaste}
						onClick={handleClick}
						onKeyDown={handleKeyDown}
					/>
					<div className="aiComposerBar">
						<div className="aiComposerControls">
							<div className="aiComposerLeftControls">
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="aiComposerMentionButton"
									aria-label="Add note with @"
									title="Add note with @"
									onClick={handleInsertMentionTrigger}
									disabled={isAwaitingResponse}
								>
									<HugeiconsIcon icon={AtIcon} size={13} strokeWidth={0.9} />
								</Button>
							</div>
							<div className="aiComposerRight">
								<ModelSelector
									key={profiles.activeProfileId ?? "no-profile"}
									profileId={profiles.activeProfileId}
									value={profiles.activeProfile?.model ?? ""}
									provider={profiles.activeProfile?.provider ?? null}
									onChange={(modelId) => void profiles.setModel(modelId)}
								/>
							</div>
						</div>
						{isAwaitingResponse ? (
							<button
								type="button"
								className="aiComposerStop"
								onClick={onStop}
								aria-label="Stop"
								title="Stop"
							>
								<HugeiconsIcon icon={StopIcon} size={14} strokeWidth={0.9} />
							</button>
						) : (
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="aiComposerSend"
								disabled={!canSend}
								onClick={onSend}
								aria-label="Send"
								title="Send"
							>
								<HugeiconsIcon icon={ArrowUp02Icon} />
							</Button>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
