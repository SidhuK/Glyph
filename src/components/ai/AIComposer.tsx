import { cn } from "@/lib/utils";
import {
	ArrowDown01Icon,
	AtIcon,
	Chat01Icon,
	Navigation03Icon,
	PaintBrush04Icon,
	StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Dispatch, SetStateAction } from "react";
import { useAISidebarContext } from "../../contexts";
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
import { AI_MODES } from "./aiPanelConstants";
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

function iconForMode(mode: "chat" | "create") {
	return mode === "create" ? PaintBrush04Icon : Chat01Icon;
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
	onAddContext,
	onRemoveContext,
}: AIComposerProps) {
	const { aiAssistantMode, setAiAssistantMode } = useAISidebarContext();
	const activeMode =
		AI_MODES.find((mode) => mode.value === aiAssistantMode) ?? AI_MODES[0];

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
							scheduleComposerInputResize();
						}}
						onKeyDown={(e) => {
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
												`aiModeDropdownTrigger-${activeMode.value}`,
											)}
											aria-label={`AI mode: ${activeMode.label}`}
											title={activeMode.hint}
											disabled={isAwaitingResponse}
										>
											<span className="aiModeDropdownTriggerMain">
												<span className="aiModeDropdownTriggerIcon">
													<HugeiconsIcon
														icon={iconForMode(activeMode.value)}
														size={12}
													/>
												</span>
												<span className="aiModeDropdownTriggerText">
													<span className="aiModeDropdownTriggerLabel">
														{activeMode.label}
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
										{AI_MODES.map((mode) => {
											const active = mode.value === aiAssistantMode;
											return (
												<DropdownMenuItem
													key={mode.value}
													className={cn(
														"aiModeDropdownItem",
														`aiModeDropdownItem-${mode.value}`,
														active && "active",
													)}
													onSelect={() => setAiAssistantMode(mode.value)}
												>
													<span className="aiModeDropdownItemIcon">
														<HugeiconsIcon
															icon={iconForMode(mode.value)}
															size={13}
														/>
													</span>
													<span className="aiModeDropdownItemBody">
														<span className="aiModeDropdownItemLabel">
															{mode.label}
														</span>
														<span className="aiModeDropdownItemHint">
															{mode.hint}
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
									profiles={profiles.profiles}
									activeProfileId={profiles.activeProfileId}
									onProfileChange={(id) => void profiles.setActive(id)}
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
