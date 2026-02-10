import { useEffect, useMemo, useRef, useState } from "react";
import {
	type Shortcut,
	formatShortcut,
	formatShortcutParts,
} from "../../lib/shortcuts";
import {
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Command as CommandRoot,
	CommandShortcut,
} from "../ui/shadcn/command";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";

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
			inputRef.current?.focus();
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

	const runCommand = (index: number) => {
		const cmd = filtered[index];
		if (!cmd) return;
		onClose();
		void cmd.action();
	};

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				className="commandPalette gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-[560px]"
				showCloseButton={false}
				onKeyDown={(e) => {
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
				<DialogTitle className="sr-only">Command Palette</DialogTitle>
				<CommandRoot>
					<CommandInput
						ref={inputRef}
						placeholder="Type a command"
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList aria-label="Command results">
						<CommandGroup>
							{filtered.map((cmd, index) => (
								<CommandItem
									key={cmd.id}
									value={cmd.label}
									data-selected={index === selectedIndex}
									onMouseEnter={() => setSelectedIndex(index)}
									onSelect={() => runCommand(index)}
								>
									<span>{cmd.label}</span>
									{cmd.shortcut ? (
										<CommandShortcut aria-label={formatShortcut(cmd.shortcut)}>
											{formatShortcutParts(cmd.shortcut).map((part) => (
												<kbd key={part}>{part}</kbd>
											))}
										</CommandShortcut>
									) : null}
								</CommandItem>
							))}
						</CommandGroup>
						{filtered.length === 0 ? (
							<CommandEmpty>No commands</CommandEmpty>
						) : null}
					</CommandList>
				</CommandRoot>
			</DialogContent>
		</Dialog>
	);
}
