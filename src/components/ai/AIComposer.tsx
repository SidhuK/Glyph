import { cn } from "@/lib/utils";
import {
	ArrowDown01Icon,
	AtIcon,
	Navigation03Icon,
	StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { APP_TAGLINE } from "../../lib/copy";
import { X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { ModelSelector } from "./ModelSelector";
import { AI_PRESETS, type AiPreset, searchAiPresetCommands } from "./aiPresets";
import type { useAiContext } from "./useAiContext";
import type { useAiProfiles } from "./useAiProfiles";

interface AIComposerProps {
	input: string;
	setInput: Dispatch<SetStateAction<string>>;
	isAwaitingResponse: boolean;
	canSend: boolean;
	onSend: () => void;
	onStop: () => void;
	composerInputRef: React.RefObject<HTMLTextAreaElement | null>;
	scheduleComposerInputResize: () => void;
	profiles: ReturnType<typeof useAiProfiles>;
	context: ReturnType<typeof useAiContext>;
	showAddPanel: boolean;
	panelQuery: string;
	addPanelOpen: boolean;
	setAddPanelOpen: (open: boolean) => void;
	setAddPanelQuery: (query: string) => void;
	activePreset: AiPreset;
	onSelectPreset: (presetId: string) => void;
	onAddContext: (kind: "folder" | "file", path: string) => void;
	onRemoveContext: (kind: "folder" | "file", path: string) => void;
}

function fileNameFromPath(path: string): string {
	const parts = path.split(/[\\/]/).filter(Boolean);
	return parts.length ? parts[parts.length - 1] : path;
}

function truncateLabel(text: string, max = 28): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
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
	showAddPanel,
	panelQuery,
	addPanelOpen,
	setAddPanelOpen,
	setAddPanelQuery,
	activePreset,
	onSelectPreset,
	onAddContext,
	onRemoveContext,
}: AIComposerProps) {
	const presetSlashMatches =
		!showAddPanel && !isAwaitingResponse ? searchAiPresetCommands(input) : [];
	const [activePresetSlashIndex, setActivePresetSlashIndex] = useState(0);
	const activePresetSlashItem = useMemo(
		() => presetSlashMatches[activePresetSlashIndex] ?? null,
		[presetSlashMatches, activePresetSlashIndex],
	);

	const applyPresetSlashSelection = (preset: AiPreset) => {
		onSelectPreset(preset.id);
		setInput((prev) => prev.replace(/^\s*\/[a-z-]+\s*/i, ""));
		scheduleComposerInputResize();
		window.requestAnimationFrame(() => composerInputRef.current?.focus());
	};

	const handleInsertMentionTrigger = () => {
		if (isAwaitingResponse) return;
		setInput((prev) => {
			const trimmedEnd = prev.replace(/\s+$/, "");
			if (!trimmedEnd) return "@";
			if (/(?:^|\s)@[\w\-./ ]*$/.test(prev)) return prev;
			return /\s$/.test(prev) ? `${prev}@` : `${prev} @`;
		});
		scheduleComposerInputResize();
		window.requestAnimationFrame(() => composerInputRef.current?.focus());
	};

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
			{presetSlashMatches.length > 0 ? (
				<div className="aiPresetSlashPanel">
					<div className="aiPresetSlashHeader">Presets</div>
					<div className="aiPresetSlashList">
						{presetSlashMatches.map((preset) => (
							<button
								key={preset.id}
								type="button"
								className={cn(
									"aiPresetSlashItem",
									preset.id === activePresetSlashItem?.id &&
										"aiPresetSlashItem-active",
								)}
								onMouseEnter={() =>
									setActivePresetSlashIndex(
										presetSlashMatches.findIndex(
											(item) => item.id === preset.id,
										),
									)
								}
								onClick={() => applyPresetSlashSelection(preset)}
							>
								<span className="aiPresetSlashItemIcon">
									<HugeiconsIcon icon={preset.icon} size={13} />
								</span>
								<span className="aiPresetSlashItemBody">
									<span className="aiPresetSlashItemLabel">
										{preset.command}
									</span>
									<span className="aiPresetSlashItemHint">
										{preset.shortDescription}
									</span>
								</span>
							</button>
						))}
					</div>
				</div>
			) : null}

			<div className="aiComposer">
				<div className="aiComposerInputShell">
					{context.attachedFolders.length > 0 ? (
						<div className="aiComposerAttachmentRow">
							<div
								className="aiComposerContextStrip"
								aria-label="Attached context"
							>
								{context.attachedFolders.map((item) => (
									<button
										key={`${item.kind}:${item.path || "space"}`}
										type="button"
										className="aiContextChip"
										onClick={() => onRemoveContext(item.kind, item.path)}
										title={`Remove ${item.label}`}
									>
										<span className="aiContextChipLabel">
											{item.kind === "file"
												? truncateLabel(
														fileNameFromPath(item.path || item.label),
													)
												: item.label || "Space"}
										</span>
										<X size={10} />
									</button>
								))}
							</div>
						</div>
					) : null}
					<textarea
						ref={composerInputRef}
						className="aiComposerInput"
						value={input}
						placeholder={APP_TAGLINE}
						disabled={isAwaitingResponse}
						onChange={(e) => {
							setInput(e.target.value);
							setActivePresetSlashIndex(0);
							scheduleComposerInputResize();
						}}
						onKeyDown={(e) => {
							if (presetSlashMatches.length > 0) {
								if (e.key === "Escape") {
									e.preventDefault();
									setInput((prev) =>
										prev.startsWith("/") ? prev.slice(1) : prev,
									);
									setActivePresetSlashIndex(0);
									scheduleComposerInputResize();
									return;
								}
								if (e.key === "ArrowDown") {
									e.preventDefault();
									setActivePresetSlashIndex((prev) =>
										Math.min(prev + 1, presetSlashMatches.length - 1),
									);
									return;
								}
								if (e.key === "ArrowUp") {
									e.preventDefault();
									setActivePresetSlashIndex((prev) => Math.max(prev - 1, 0));
									return;
								}
								if (
									e.key === "Enter" &&
									!e.shiftKey &&
									!e.metaKey &&
									!e.ctrlKey &&
									activePresetSlashItem
								) {
									e.preventDefault();
									applyPresetSlashSelection(activePresetSlashItem);
									return;
								}
							}
							if (
								e.key === "Enter" &&
								!e.shiftKey &&
								!e.metaKey &&
								!e.ctrlKey
							) {
								e.preventDefault();
								onSend();
							}
						}}
						rows={1}
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
									<HugeiconsIcon icon={AtIcon} size={13} />
								</Button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											className={cn(
												"aiModeDropdownTrigger",
												"aiPresetDropdownTrigger",
											)}
											aria-label={`AI preset: ${activePreset.label}`}
											title={activePreset.description}
											disabled={isAwaitingResponse}
										>
											<span className="aiModeDropdownTriggerMain">
												<span className="aiModeDropdownTriggerIcon aiPresetDropdownTriggerIcon">
													<HugeiconsIcon icon={activePreset.icon} size={12} />
												</span>
												<span className="aiModeDropdownTriggerText">
													<span className="aiModeDropdownTriggerLabel aiPresetDropdownTriggerLabel">
														{activePreset.label}
													</span>
												</span>
											</span>
											<HugeiconsIcon
												icon={ArrowDown01Icon}
												size={12}
												className="aiModeDropdownTriggerChevron"
											/>
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										align="start"
										side="top"
										className="aiModeDropdownMenu"
									>
										{AI_PRESETS.map((preset) => {
											const active = preset.id === activePreset.id;
											return (
												<DropdownMenuItem
													key={preset.id}
													className={cn(
														"aiModeDropdownItem",
														"aiPresetDropdownItem",
														active && "active",
													)}
													onSelect={() => onSelectPreset(preset.id)}
												>
													<span className="aiModeDropdownItemIcon aiPresetDropdownItemIcon">
														<HugeiconsIcon icon={preset.icon} size={13} />
													</span>
													<span className="aiModeDropdownItemBody">
														<span className="aiModeDropdownItemLabel">
															{preset.label}
														</span>
														<span className="aiModeDropdownItemHint">
															{preset.shortDescription}
														</span>
													</span>
													{active ? (
														<span className="aiModeDropdownItemStatus">
															Current
														</span>
													) : null}
												</DropdownMenuItem>
											);
										})}
									</DropdownMenuContent>
								</DropdownMenu>
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
								<HugeiconsIcon icon={StopIcon} size={14} />
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
								<HugeiconsIcon icon={Navigation03Icon} size={14} />
							</Button>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
