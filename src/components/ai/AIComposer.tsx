import { cn } from "@/lib/utils";
import {
	Chat01Icon,
	Link01Icon,
	Navigation03Icon,
	PaintBrush04Icon,
	StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m, useReducedMotion } from "motion/react";
import { useAISidebarContext } from "../../contexts";
import { FileText, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { ModelSelector } from "./ModelSelector";
import { AI_MODES } from "./aiPanelConstants";
import type { useAiContext } from "./useAiContext";
import type { useAiProfiles } from "./useAiProfiles";

interface AIComposerProps {
	input: string;
	setInput: (value: string) => void;
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
	onAttachContextFiles: (paths: string[]) => Promise<void>;
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
	onAddContext,
	onRemoveContext,
	onAttachContextFiles,
}: AIComposerProps) {
	const { aiAssistantMode, setAiAssistantMode } = useAISidebarContext();
	const shouldReduceMotion = useReducedMotion();

	return (
		<>
			{context.attachedFolders.length > 0 ? (
				<div className="aiContextChips">
					{context.attachedFolders.map((item) => (
						<button
							key={`${item.kind}:${item.path || "vault"}`}
							type="button"
							className="aiContextChip"
							onClick={() => onRemoveContext(item.kind, item.path)}
							title={`Remove ${item.label}`}
						>
							<span className="aiContextChipLabel">
								{item.kind === "file"
									? truncateLabel(fileNameFromPath(item.path || item.label))
									: item.label || "Vault"}
							</span>
							<X size={10} />
						</button>
					))}
				</div>
			) : null}

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
									key={`${item.kind}:${item.path || "vault"}`}
									type="button"
									className="aiAddPanelItem"
									onClick={() => onAddContext(item.kind, item.path)}
								>
									<span>{item.label || "Vault"}</span>
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
					<textarea
						ref={composerInputRef}
						className="aiComposerInput"
						value={input}
						placeholder="Write. Reflect. Discover."
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
					<div className="aiModeMiniToggle" role="tablist" aria-label="AI mode">
						{AI_MODES.map((mode) => {
							const active = mode.value === aiAssistantMode;
							return (
								<button
									key={mode.value}
									type="button"
									role="tab"
									aria-selected={active}
									className={cn(
										"aiModeMiniOption",
										`aiModeMiniOption-${mode.value}`,
										active && "active",
									)}
									title={mode.hint}
									onClick={() => setAiAssistantMode(mode.value)}
									disabled={isAwaitingResponse}
								>
									{active ? (
										<m.span
											layoutId="ai-mode-active"
											className={cn(
												"aiModeMiniActive",
												`aiModeMiniActive-${mode.value}`,
											)}
											transition={
												shouldReduceMotion
													? { duration: 0 }
													: {
															type: "spring",
															stiffness: 260,
															damping: 30,
															mass: 0.9,
														}
											}
										/>
									) : null}
									<span className="aiModeMiniText">
										<HugeiconsIcon
											icon={
												mode.value === "create" ? PaintBrush04Icon : Chat01Icon
											}
											size={11}
										/>
										{mode.label}
									</span>
								</button>
							);
						})}
					</div>
					<div className="aiComposerBar">
						<div className="aiComposerTools">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Attach file or folder"
								title="Attach file or folder"
								onClick={() => {
									setAddPanelOpen(true);
									setAddPanelQuery("");
								}}
							>
								<HugeiconsIcon icon={Link01Icon} size={14} />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Attach selected context files"
								title="Attach selected context files"
								onClick={() =>
									void context
										.resolveAttachedPaths()
										.then((paths) => onAttachContextFiles(paths))
								}
								disabled={context.attachedFolders.length === 0}
							>
								<FileText size={14} />
							</Button>
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
			</div>
		</>
	);
}
