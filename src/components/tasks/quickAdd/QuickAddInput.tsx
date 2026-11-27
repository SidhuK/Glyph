import { type KeyboardEvent, useRef } from "react";
import type { QuickAddToken } from "@/lib/taskFields/quickAdd";
import { isImeComposing } from "@/lib/imeComposition";

interface QuickAddInputProps {
	value: string;
	tokens: readonly QuickAddToken[];
	label: string;
	placeholder: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
}

interface MirrorSegment {
	key: string;
	text: string;
	kind: QuickAddToken["kind"] | null;
}

function mirrorSegments(value: string, tokens: readonly QuickAddToken[]): MirrorSegment[] {
	const segments: MirrorSegment[] = [];
	let cursor = 0;
	for (const token of tokens) {
		if (token.start < cursor) continue;
		if (token.start > cursor) {
			segments.push({ key: `text:${cursor}`, text: value.slice(cursor, token.start), kind: null });
		}
		segments.push({
			key: `token:${token.start}`,
			text: value.slice(token.start, token.end),
			kind: token.kind,
		});
		cursor = token.end;
	}
	if (cursor < value.length)
		segments.push({ key: `text:${cursor}`, text: value.slice(cursor), kind: null });
	return segments;
}

function focusOnMount(node: HTMLInputElement | null) {
	node?.focus({ preventScroll: true });
}

export function QuickAddInput({
	value,
	tokens,
	label,
	placeholder,
	onChange,
	onSubmit,
	onCancel,
}: QuickAddInputProps) {
	const mirrorRef = useRef<HTMLDivElement>(null);

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (isImeComposing(event)) {
			event.stopPropagation();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			onSubmit();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			onCancel();
		}
	};

	return (
		<div className="tasksQuickAddInputWrap">
			<div ref={mirrorRef} className="tasksQuickAddMirror" aria-hidden="true">
				{mirrorSegments(value, tokens).map((segment) =>
					segment.kind ? (
						<mark key={segment.key} className="tasksQuickAddToken" data-kind={segment.kind}>
							{segment.text}
						</mark>
					) : (
						<span key={segment.key}>{segment.text}</span>
					),
				)}
			</div>
			<input
				ref={focusOnMount}
				className="tasksQuickAddInput"
				type="text"
				aria-label={label}
				placeholder={placeholder}
				value={value}
				spellCheck={false}
				autoComplete="off"
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={handleKeyDown}
				onScroll={(event) => {
					if (mirrorRef.current) mirrorRef.current.scrollLeft = event.currentTarget.scrollLeft;
				}}
			/>
		</div>
	);
}
