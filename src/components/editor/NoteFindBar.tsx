import type { KeyboardEvent, RefObject } from "react";
import { Search } from "../Icons";
import { Input } from "../ui/shadcn/input";

interface NoteFindBarProps {
	countLabel: string;
	inputRef: RefObject<HTMLInputElement | null>;
	matchCount: number;
	query: string;
	onClose: () => void;
	onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	onNext: () => void;
	onPrevious: () => void;
	onQueryChange: (query: string) => void;
}

export function NoteFindBar({
	countLabel,
	inputRef,
	matchCount,
	query,
	onClose,
	onInputKeyDown,
	onNext,
	onPrevious,
	onQueryChange,
}: NoteFindBarProps) {
	return (
		<div className="noteFindBar nodrag nopan nowheel">
			<Search size={13} className="noteFindIcon" aria-hidden />
			<Input
				ref={inputRef}
				className="noteFindInput"
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={onInputKeyDown}
				placeholder="Find in note"
				aria-label="Find in note"
			/>
			<span className="noteFindCount" aria-live="polite">
				{countLabel}
			</span>
			<button
				type="button"
				className="noteFindIconButton"
				onClick={onPrevious}
				disabled={!matchCount}
				aria-label="Previous match"
				title="Previous match"
			>
				<span className="noteFindButtonGlyph" aria-hidden>
					↑
				</span>
			</button>
			<button
				type="button"
				className="noteFindIconButton"
				onClick={onNext}
				disabled={!matchCount}
				aria-label="Next match"
				title="Next match"
			>
				<span className="noteFindButtonGlyph" aria-hidden>
					↓
				</span>
			</button>
			<button
				type="button"
				className="noteFindIconButton"
				onClick={onClose}
				aria-label="Close find"
				title="Close find"
			>
				<span className="noteFindButtonGlyph" aria-hidden>
					×
				</span>
			</button>
		</div>
	);
}
