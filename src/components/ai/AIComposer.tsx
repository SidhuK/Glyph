import { Navigation03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";
import { useUIContext } from "../../contexts";
import { cn } from "@/lib/utils";
import {
	AiLattice,
	FileText,
	Layout,
	Paperclip,
	X,
} from "../Icons";
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
	isChatMode: boolean;
	lastAssistantText: string;
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
	onCreateNoteFromLastAssistant: (markdown: string) => Promise<void>;
}

export function AIComposer({
	input,
	setInput,
	isAwaitingResponse,
	canSend,
	isChatMode,
	lastAssistantText,
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
	onCreateNoteFromLastAssistant,
}: AIComposerProps) {
	const { aiAssistantMode, setAiAssistantMode } = useUIContext();
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
							<span>{item.label || "Vault"}</span>
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
									{item.kind === "folder" ? (
										<Layout size={12} />
									) : (
										<FileText size={12} />
									)}
									<span>{item.label || "Vault"}</span>
								</button>
							))
						) : (
							<div className="aiAddPanelEmpty">No results</div>
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
						placeholder="Ask AI…"
						disabled={isAwaitingResponse}
						onChange={(e) => {
							setInput(e.target.value);
							scheduleComposerInputResize();
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
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
									className={cn("aiModeMiniOption", active && "active")}
									title={mode.hint}
									onClick={() => setAiAssistantMode(mode.value)}
									disabled={isAwaitingResponse}
								>
									{active ? (
										<motion.span
											layoutId="ai-mode-active"
											className={cn(
												"aiModeMiniActive",
												`aiModeMiniActive-${mode.value}`,
											)}
											transition={
												shouldReduceMotion
													? { duration: 0 }
													: { type: "spring", stiffness: 420, damping: 28 }
											}
										/>
									) : null}
									<span className="aiModeMiniText">{mode.label}</span>
								</button>
							);
						})}
					</div>
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
							<Paperclip size={14} />
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
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Create note from last reply"
							title="Create note from last reply"
							onClick={() => void onCreateNoteFromLastAssistant(lastAssistantText)}
							disabled={isChatMode || !lastAssistantText}
						>
							<AiLattice size={18} />
						</Button>
					</div>
					<div className="aiComposerRight">
						<ModelSelector
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
							>
								Stop
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
