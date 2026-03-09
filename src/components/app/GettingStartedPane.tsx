import { Calendar, Command, FileText, X } from "../Icons";

interface GettingStartedPaneProps {
	commandShortcutParts: string[];
	showDailyNoteAction: boolean;
	onCreateNote: () => void;
	onOpenCommandPalette: () => void;
	onOpenDailyNote: () => void;
	onOpenTasks: () => void;
	onDismiss: () => void;
}

const starterActions = [
	{
		key: "note",
		title: "Create your first note",
		description: "Start with a markdown note in this space.",
		icon: FileText,
	},
	{
		key: "command",
		title: "Open the command palette",
		description: "Jump to commands, files, and actions from one place.",
		icon: Command,
	},
] as const;

export function GettingStartedPane({
	commandShortcutParts,
	showDailyNoteAction,
	onCreateNote,
	onOpenCommandPalette,
	onOpenDailyNote,
	onOpenTasks,
	onDismiss,
}: GettingStartedPaneProps) {
	return (
		<div className="starterPane">
			<div className="starterPaneHeader">
				<div>
					<div className="starterPaneTitle">Start with one action</div>
					<p className="starterPaneBody">
						Glyph works best once you have a note, a command, or a daily entry
						in motion.
					</p>
				</div>
				<button
					type="button"
					className="starterDismissButton"
					onClick={onDismiss}
					aria-label="Dismiss getting started"
				>
					<X size={14} />
				</button>
			</div>

			<div className="starterActionList">
				{starterActions.map((action) => (
					<button
						key={action.key}
						type="button"
						className="starterAction"
						onClick={
							action.key === "note" ? onCreateNote : onOpenCommandPalette
						}
					>
						<div className="starterActionIcon">
							<action.icon size={16} strokeWidth={1.7} />
						</div>
						<div className="starterActionText">
							<div className="starterActionTitle">{action.title}</div>
							<div className="starterActionBody">{action.description}</div>
						</div>
						{action.key === "command" && (
							<div className="starterShortcut">
								{commandShortcutParts.map((part) => (
									<kbd key={part}>{part}</kbd>
								))}
							</div>
						)}
					</button>
				))}

				{showDailyNoteAction && (
					<button
						type="button"
						className="starterAction"
						onClick={onOpenDailyNote}
					>
						<div className="starterActionIcon">
							<Calendar size={16} strokeWidth={1.7} />
						</div>
						<div className="starterActionText">
							<div className="starterActionTitle">
								Open today&apos;s daily note
							</div>
							<div className="starterActionBody">
								Create a dated note and start writing immediately.
							</div>
						</div>
					</button>
				)}
			</div>

			<div className="starterPaneFooter">
				<button
					type="button"
					className="starterInlineButton"
					onClick={onOpenTasks}
				>
					Open tasks
				</button>
				<span className="starterFooterText">
					Notes stay as markdown files inside your folder.
				</span>
			</div>
		</div>
	);
}
