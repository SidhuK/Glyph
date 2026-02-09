import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	type Shortcut,
	formatShortcut,
	formatShortcutParts,
} from "../../lib/shortcuts";

export interface Command {
	id: string;
	label: string;
	shortcut?: Shortcut;
	action: () => void | Promise<void>;
	enabled?: boolean;
}

interface CommandPaletteProps {
	open: boolean;
	commands: Command[];
	onClose: () => void;
}

export function CommandPalette({
	open,
	commands,
	onClose,
}: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const panelRef = useRef<HTMLDialogElement | null>(null);
	const previousFocusRef = useRef<Element | null>(null);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const matches = q
			? commands.filter((cmd) => cmd.label.toLowerCase().includes(q))
			: commands;
		return matches.filter((cmd) => cmd.enabled !== false);
	}, [commands, query]);

	useEffect(() => {
		if (!open) return;
		previousFocusRef.current = document.activeElement;
		setQuery("");
		setSelectedIndex(0);
		window.requestAnimationFrame(() => {
			panelRef.current?.focus();
			window.requestAnimationFrame(() => inputRef.current?.focus());
		});
		return () => {
			const prev = previousFocusRef.current;
			if (prev instanceof HTMLElement) prev.focus();
		};
	}, [open]);

	useEffect(() => {
		setSelectedIndex((curr) =>
			Math.min(curr, Math.max(filtered.length - 1, 0)),
		);
	}, [filtered.length]);

	if (!open) return null;

	const runCommand = (index: number) => {
		const cmd = filtered[index];
		if (!cmd) return;
		onClose();
		void cmd.action();
	};

	return createPortal(
		<div
			className="commandPaletteBackdrop"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key !== "Escape" && e.key !== "Enter" && e.key !== " ") return;
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}}
		>
			<dialog
				ref={panelRef}
				open
				className="commandPalette"
				aria-label="Command palette"
				tabIndex={-1}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Escape") {
						e.preventDefault();
						onClose();
						return;
					}
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setSelectedIndex((curr) =>
							filtered.length ? Math.min(curr + 1, filtered.length - 1) : 0,
						);
						return;
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						setSelectedIndex((curr) => (curr > 0 ? curr - 1 : 0));
						return;
					}
					if (e.key === "Enter") {
						e.preventDefault();
						runCommand(selectedIndex);
					}
				}}
			>
				<input
					ref={inputRef}
					type="text"
					className="commandPaletteInput"
					placeholder="Type a command"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<ul className="commandPaletteList">
					{filtered.map((cmd, index) => (
						<li key={cmd.id}>
							<button
								type="button"
								className={
									index === selectedIndex
										? "commandPaletteItem selected"
										: "commandPaletteItem"
								}
								onMouseEnter={() => setSelectedIndex(index)}
								onClick={() => runCommand(index)}
							>
								<span>{cmd.label}</span>
								{cmd.shortcut ? (
									<span
										className="commandPaletteShortcut"
										aria-label={formatShortcut(cmd.shortcut)}
									>
										{formatShortcutParts(cmd.shortcut).map((part) => (
											<kbd key={part}>{part}</kbd>
										))}
									</span>
								) : null}
							</button>
						</li>
					))}
					{filtered.length === 0 ? (
						<li className="commandPaletteEmpty">No commands</li>
					) : null}
				</ul>
			</dialog>
		</div>,
		document.body,
	);
}
