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
	setShowFileTreeFolderCounts,
	setShowNonMarkdownFiles,
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
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";

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
	const [error, setError] = useState("");
	const resumeLastSession = useSettingsBoolean(
		false,
		setResumeLastSession,
		setError,
	);
	const showToc = useSettingsBoolean(true, setShowToc, setError);
	const showFrontmatter = useSettingsBoolean(
		false,
		setEditorShowFrontmatterInEditor,
		setError,
	);
	const colorfulHeadings = useSettingsBoolean(
		false,
		setEditorColorfulHeadings,
		setError,
	);
	const collapsibleHeadings = useSettingsBoolean(
		false,
		setEditorShowCollapsibleHeadings,
		setError,
	);
	const spellCheck = useSettingsBoolean(true, setEditorSpellCheck, setError);
	const vimKeybindings = useSettingsBoolean(
		false,
		setEditorVimKeybindings,
		setError,
	);
	const folderCounts = useSettingsBoolean(
		false,
		setShowFileTreeFolderCounts,
		setError,
	);
	const nonMarkdownFiles = useSettingsBoolean(
		true,
		setShowNonMarkdownFiles,
		setError,
	);

	const setResumeLastSessionChecked = resumeLastSession.setChecked;
	const setShowTocChecked = showToc.setChecked;
	const setShowFrontmatterChecked = showFrontmatter.setChecked;
	const setColorfulHeadingsChecked = colorfulHeadings.setChecked;
	const setCollapsibleHeadingsChecked = collapsibleHeadings.setChecked;
	const setSpellCheckChecked = spellCheck.setChecked;
	const setVimKeybindingsChecked = vimKeybindings.setChecked;
	const setFolderCountsChecked = folderCounts.setChecked;
	const setNonMarkdownFilesChecked = nonMarkdownFiles.setChecked;

	useEffect(() => {
		let cancelled = false;
		setError("");
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setResumeLastSessionChecked(settings.ui.resumeLastSession);
				setShowTocChecked(settings.ui.showToc);
				setShowFrontmatterChecked(settings.editor.showFrontmatterInEditor);
				setColorfulHeadingsChecked(settings.editor.colorfulHeadings);
				setCollapsibleHeadingsChecked(settings.editor.showCollapsibleHeadings);
				setSpellCheckChecked(settings.editor.spellCheck);
				setVimKeybindingsChecked(settings.editor.vimKeybindings);
				setFolderCountsChecked(settings.ui.showFileTreeFolderCounts);
				setNonMarkdownFilesChecked(settings.ui.showNonMarkdownFiles);
			})
			.catch((cause) => {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [
		setResumeLastSessionChecked,
		setShowTocChecked,
		setShowFrontmatterChecked,
		setColorfulHeadingsChecked,
		setCollapsibleHeadingsChecked,
		setSpellCheckChecked,
		setVimKeybindingsChecked,
		setFolderCountsChecked,
		setNonMarkdownFilesChecked,
	]);

	useTauriEvent(
		"settings:updated",
		useCallback(
			(payload) => {
				applyIfBoolean(
					payload.ui?.resumeLastSession,
					setResumeLastSessionChecked,
				);
				applyIfBoolean(payload.ui?.showToc, setShowTocChecked);
				applyIfBoolean(
					payload.editor?.showFrontmatterInEditor,
					setShowFrontmatterChecked,
				);
				applyIfBoolean(
					payload.editor?.colorfulHeadings,
					setColorfulHeadingsChecked,
				);
				applyIfBoolean(
					payload.editor?.showCollapsibleHeadings,
					setCollapsibleHeadingsChecked,
				);
				applyIfBoolean(payload.editor?.spellCheck, setSpellCheckChecked);
				applyIfBoolean(
					payload.editor?.vimKeybindings,
					setVimKeybindingsChecked,
				);
				applyIfBoolean(
					payload.ui?.showFileTreeFolderCounts,
					setFolderCountsChecked,
				);
				applyIfBoolean(
					payload.ui?.showNonMarkdownFiles,
					setNonMarkdownFilesChecked,
				);
			},
			[
				setResumeLastSessionChecked,
				setShowTocChecked,
				setShowFrontmatterChecked,
				setColorfulHeadingsChecked,
				setCollapsibleHeadingsChecked,
				setSpellCheckChecked,
				setVimKeybindingsChecked,
				setFolderCountsChecked,
				setNonMarkdownFilesChecked,
			],
		),
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
							checked={resumeLastSession.checked}
							disabled={resumeLastSession.isSaving}
							ariaLabel="Resume last session"
							onCheckedChange={resumeLastSession.onCheckedChange}
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
							checked={showToc.checked}
							disabled={showToc.isSaving}
							ariaLabel="Table of contents"
							onCheckedChange={showToc.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Show frontmatter in editor"
						description="Display YAML frontmatter at the top of notes while editing. Turning this off keeps frontmatter available to indexing and databases."
					>
						<SettingsToggle
							checked={showFrontmatter.checked}
							disabled={showFrontmatter.isSaving}
							ariaLabel="Show frontmatter in editor"
							onCheckedChange={showFrontmatter.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Colorful headings"
						description="Use distinct built-in colors for H1-H6 while editing notes."
					>
						<SettingsToggle
							checked={colorfulHeadings.checked}
							disabled={colorfulHeadings.isSaving}
							ariaLabel="Colorful headings"
							onCheckedChange={colorfulHeadings.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Collapsible headings"
						description="Show collapse toggles on note headings in editor and preview."
					>
						<SettingsToggle
							checked={collapsibleHeadings.checked}
							disabled={collapsibleHeadings.isSaving}
							ariaLabel="Collapsible headings"
							onCheckedChange={collapsibleHeadings.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Spell check"
						description="Underline typos as you type. Right-click a word to see spelling suggestions."
					>
						<SettingsToggle
							checked={spellCheck.checked}
							disabled={spellCheck.isSaving}
							ariaLabel="Spell check"
							onCheckedChange={spellCheck.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						title="Vim Mode"
						label={
							<span className="settingsLabelWithHelp">
								Vim Mode
								<VimKeybindingsHelp />
							</span>
						}
						description="Do NOT Turn this ON if you don't know what it means."
					>
						<SettingsToggle
							checked={vimKeybindings.checked}
							disabled={vimKeybindings.isSaving}
							ariaLabel="Vim Mode"
							onCheckedChange={vimKeybindings.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
				<FileTreeSettingsSection
					folderCounts={folderCounts}
					nonMarkdownFiles={nonMarkdownFiles}
					setError={setError}
				/>
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
