import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { formatTimestamp } from "../../lib/formatTimestamp";
import type { GitSyncStatus } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "../ui/shadcn/popover";

interface WindowChromeGitSyncButtonProps {
	status: GitSyncStatus | null;
	onSyncNow: () => void;
	onOpenSettings: () => void;
}

function statusLabel(status: GitSyncStatus | null): string {
	if (status?.is_syncing) return "Syncing";
	if (status?.last_error) return "Attention";
	if (status?.paused) return "Paused";
	if (status?.enabled) return "Ready";
	return "Disabled";
}

function modeLabel(status: GitSyncStatus | null): string {
	if (!status?.configured) return "Not connected";
	if (status.paused) return "Auto sync paused";
	if (status.enabled) return "Auto sync on";
	return "Manual only";
}

export function WindowChromeGitSyncButton({
	status,
	onSyncNow,
	onOpenSettings,
}: WindowChromeGitSyncButtonProps) {
	const buttonState = useMemo(() => {
		if (!status?.configured) {
			return { label: "Git", tone: "idle", title: "Open Git Sync settings" };
		}
		if (status.is_syncing) {
			return { label: "Git", tone: "syncing", title: "Git Sync is running" };
		}
		if (status.last_error) {
			return { label: "Git", tone: "error", title: status.last_error };
		}
		if (status.paused || !status.enabled) {
			return { label: "Git", tone: "paused", title: "Git Sync is paused" };
		}
		return { label: "Git", tone: "healthy", title: "Git Sync is healthy" };
	}, [status]);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={`windowChromeGitSyncButton windowChromeGitSyncButton-${buttonState.tone}`}
					data-window-drag-ignore
					title={buttonState.title}
					aria-label="Open Git Sync controls"
				>
					<span
						className={`windowChromeGitSyncIndicator windowChromeGitSyncIndicator-${buttonState.tone}`}
						aria-hidden="true"
					/>
					<HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={0.9} />
					<span className="windowChromeGitSyncButtonLabel">
						{buttonState.label}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="windowChromeGitSyncPopover"
			>
				<PopoverHeader className="windowChromeGitSyncPopoverHeader">
					<div className="windowChromeGitSyncTitleRow">
						<div className="windowChromeGitSyncTitleGroup">
							<span
								className={`windowChromeGitSyncIndicator windowChromeGitSyncIndicator-${buttonState.tone}`}
								aria-hidden="true"
							/>
							<div>
								<PopoverTitle>Git Sync</PopoverTitle>
								<div className="windowChromeGitSyncSubtitle">
									{modeLabel(status)}
								</div>
							</div>
						</div>
						<span
							className={`windowChromeGitSyncStatusBadge windowChromeGitSyncStatusBadge-${buttonState.tone}`}
						>
							{statusLabel(status)}
						</span>
					</div>
					<PopoverDescription>
						{status?.message ??
							(status?.configured
								? "Backup and sync this space with Git."
								: "Open a space with a Git repository at its root to enable sync.")}
					</PopoverDescription>
				</PopoverHeader>
				<div className="windowChromeGitSyncMeta">
					<div className="windowChromeGitSyncMetaList">
						<div className="windowChromeGitSyncMetaRow">
							<span className="windowChromeGitSyncMetaKey">Last sync</span>
							<span className="windowChromeGitSyncMetaValue">
								{formatTimestamp(status?.last_success_at_ms ?? null)}
							</span>
						</div>
						<div className="windowChromeGitSyncMetaRow">
							<span className="windowChromeGitSyncMetaKey">Mode</span>
							<span className="windowChromeGitSyncMetaValue">
								{modeLabel(status)}
							</span>
						</div>
					</div>
					{status?.remote_url ? (
						<div className="windowChromeGitSyncRemote">
							<div className="windowChromeGitSyncMetaKey">Remote</div>
							<div className="windowChromeGitSyncRemoteValue truncate">
								{status.remote_url}
							</div>
						</div>
					) : null}
					{status?.last_error ? (
						<div className="windowChromeGitSyncError">{status.last_error}</div>
					) : null}
				</div>
				<div className="windowChromeGitSyncActions">
					<Button
						type="button"
						size="sm"
						variant="secondary"
						className="windowChromeGitSyncActionPrimary"
						onClick={onSyncNow}
						disabled={!status?.configured || status.is_syncing}
					>
						Sync Now
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="windowChromeGitSyncActionSecondary"
						onClick={onOpenSettings}
					>
						Settings
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
