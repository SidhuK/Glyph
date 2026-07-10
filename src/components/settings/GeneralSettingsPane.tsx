import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import {
	loadSettings,
	setEditorColorfulHeadings,
	setEditorShowCollapsibleHeadings,
	setEditorShowFrontmatterInEditor,
	setEditorSpellCheck,
	setEditorVimKeybindings,
	setResumeLastSession,
	setShowToc,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { FileTreeSettingsSection } from "./FileTreeSettingsSection";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { useOptimisticSettingsToggle } from "./useOptimisticSettingsToggle";

const VIM_KEYBINDING_HELP = [
	{ key: "Esc", action: "Enter Vim command mode." },
	{ key: "i", action: "Type at the cursor." },
	{ key: "a", action: "Type after the cursor." },
	{ key: "I", action: "Go to the start of the line and type." },
	{ key: "A", action: "Go to the end of the line and type." },
	{ key: "o", action: "Open a new line below and type." },
	{ key: "O", action: "Open a new line above and type." },
	{ key: "h / j / k / l", action: "Move left, down, up, and right." },
	{ key: "w", action: "Jump to the next word." },
	{ key: "b", action: "Jump back to the previous word." },
	{ key: "e", action: "Jump to the end of the word." },
	{ key: "0", action: "Jump to the start of the line." },
	{ key: "$", action: "Jump to the end of the line." },
	{ key: "gg", action: "Jump to the start of the note." },
	{ key: "G", action: "Jump to the end of the note." },
	{ key: "x", action: "Delete the character under or near the cursor." },
	{ key: "dd", action: "Delete the current line's contents." },
	{ key: "u", action: "Undo." },
	{ key: "Control-r", action: "Redo." },
] as const;

function VimKeybindingsHelp() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="vimKeybindingsInfoButton"
					aria-label="Vim keybindings help"
				>
					<HugeiconsIcon
						icon={InformationCircleIcon}
						size="var(--icon-md)"
						strokeWidth={0.9}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="right"
				sideOffset={8}
				className="vimKeybindingsPopover"
			>
				<div className="vimKeybindingsPopoverTitle">Vim keybindings</div>
				<div className="vimKeybindingsModes">
					<div>
						<strong>insert</strong> means normal typing mode. You type and text
						appears, like the editor already does.
					</div>
					<div>
						<strong>normal</strong> means command mode. Your keys move around or
						edit text instead of typing letters.
					</div>
				</div>
				<div className="vimKeybindingsList">
					{VIM_KEYBINDING_HELP.map((item) => (
						<div className="vimKeybindingsItem" key={item.key}>
							<kbd>{item.key}</kbd>
							<span>{item.action}</span>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function GeneralSettingsPane() {
	const [resumeLastSession, setResumeLastSessionState] = useState(false);
	const [showToc, setShowTocState] = useState(true);
	const [showFrontmatter, setShowFrontmatter] = useState(false);
	const [colorfulHeadings, setColorfulHeadings] = useState(false);
	const [collapsibleHeadings, setCollapsibleHeadings] = useState(false);
	const [spellCheck, setSpellCheck] = useState(true);
	const [vimKeybindings, setVimKeybindings] = useState(false);
	const [error, setError] = useState("");
	const resumeLastSessionToggle = useOptimisticSettingsToggle(
		resumeLastSession,
		setResumeLastSessionState,
		setResumeLastSession,
		setError,
	);
	const showTocToggle = useOptimisticSettingsToggle(
		showToc,
		setShowTocState,
		setShowToc,
		setError,
	);
	const showFrontmatterToggle = useOptimisticSettingsToggle(
		showFrontmatter,
		setShowFrontmatter,
		setEditorShowFrontmatterInEditor,
		setError,
	);
	const colorfulHeadingsToggle = useOptimisticSettingsToggle(
		colorfulHeadings,
		setColorfulHeadings,
		setEditorColorfulHeadings,
		setError,
	);
	const collapsibleHeadingsToggle = useOptimisticSettingsToggle(
		collapsibleHeadings,
		setCollapsibleHeadings,
		setEditorShowCollapsibleHeadings,
		setError,
	);
	const spellCheckToggle = useOptimisticSettingsToggle(
		spellCheck,
		setSpellCheck,
		setEditorSpellCheck,
		setError,
	);
	const vimKeybindingsToggle = useOptimisticSettingsToggle(
		vimKeybindings,
		setVimKeybindings,
		setEditorVimKeybindings,
		setError,
	);

	useEffect(() => {
		let cancelled = false;
		setError("");
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setResumeLastSessionState(settings.ui.resumeLastSession);
				setShowTocState(settings.ui.showToc);
				setShowFrontmatter(settings.editor.showFrontmatterInEditor);
				setColorfulHeadings(settings.editor.colorfulHeadings);
				setCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
				setSpellCheck(settings.editor.spellCheck);
				setVimKeybindings(settings.editor.vimKeybindings);
			})
			.catch((cause) => {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent(
		"settings:updated",
		useCallback((payload) => {
			if (typeof payload.ui?.resumeLastSession === "boolean") {
				setResumeLastSessionState(payload.ui.resumeLastSession);
			}
			if (typeof payload.ui?.showToc === "boolean") {
				setShowTocState(payload.ui.showToc);
			}
			if (typeof payload.editor?.showFrontmatterInEditor === "boolean") {
				setShowFrontmatter(payload.editor.showFrontmatterInEditor);
			}
			if (typeof payload.editor?.colorfulHeadings === "boolean") {
				setColorfulHeadings(payload.editor.colorfulHeadings);
			}
			if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
				setCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
			}
			if (typeof payload.editor?.spellCheck === "boolean") {
				setSpellCheck(payload.editor.spellCheck);
			}
			if (typeof payload.editor?.vimKeybindings === "boolean") {
				setVimKeybindings(payload.editor.vimKeybindings);
			}
		}, []),
	);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<SettingsSection
					title="Startup"
					description="Choose what opens when you start Glyph."
				>
					<SettingsRow
						label="Open previous tabs"
						description="Start this space with the tabs you left open."
					>
						<SettingsToggle
							checked={resumeLastSession}
							disabled={resumeLastSessionToggle.isSaving}
							ariaLabel="Resume last session"
							onCheckedChange={resumeLastSessionToggle.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title="Editor"
					description="Controls for editing behavior and note structure inside Glyph."
				>
					<SettingsRow
						label="Table of contents"
						description="Show a floating table of contents for each note."
					>
						<SettingsToggle
							checked={showToc}
							disabled={showTocToggle.isSaving}
							ariaLabel="Table of contents"
							onCheckedChange={showTocToggle.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Show frontmatter in editor"
						description="Display YAML frontmatter at the top of notes while editing. Turning this off keeps frontmatter available to indexing and databases."
					>
						<SettingsToggle
							checked={showFrontmatter}
							disabled={showFrontmatterToggle.isSaving}
							ariaLabel="Show frontmatter in editor"
							onCheckedChange={showFrontmatterToggle.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Colorful headings"
						description="Use distinct built-in colors for H1-H6 while editing notes."
					>
						<SettingsToggle
							checked={colorfulHeadings}
							disabled={colorfulHeadingsToggle.isSaving}
							ariaLabel="Colorful headings"
							onCheckedChange={colorfulHeadingsToggle.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Collapsible headings"
						description="Show collapse toggles on note headings in editor and preview."
					>
						<SettingsToggle
							checked={collapsibleHeadings}
							disabled={collapsibleHeadingsToggle.isSaving}
							ariaLabel="Collapsible headings"
							onCheckedChange={collapsibleHeadingsToggle.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Spell check"
						description="Underline typos as you type. Right-click a word to see spelling suggestions."
					>
						<SettingsToggle
							checked={spellCheck}
							disabled={spellCheckToggle.isSaving}
							ariaLabel="Spell check"
							onCheckedChange={spellCheckToggle.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={
							<span className="settingsLabelWithHelp">
								Vim Mode
								<VimKeybindingsHelp />
							</span>
						}
						description="Do NOT Turn this ON if you don't know what it means."
					>
						<SettingsToggle
							checked={vimKeybindings}
							disabled={vimKeybindingsToggle.isSaving}
							ariaLabel="Vim Mode"
							onCheckedChange={vimKeybindingsToggle.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
				<FileTreeSettingsSection />
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
