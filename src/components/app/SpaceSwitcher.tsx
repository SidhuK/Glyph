import {
	Folder01Icon,
	FolderOpenIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

interface SpaceSwitcherProps {
	spacePath: string;
	recentSpaces: string[];
	onSelectSpace: (path: string) => Promise<void>;
	onOpenSpace: () => Promise<void>;
	onCreateSpace: () => Promise<void>;
}

function spacePathParts(path: string): { name: string; parent: string } {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const separatorIndex = normalized.lastIndexOf("/");
	if (separatorIndex < 0) return { name: normalized, parent: "" };
	return {
		name: normalized.slice(separatorIndex + 1) || normalized,
		parent: normalized.slice(0, separatorIndex) || "/",
	};
}

function spaceMonogram(name: string): string {
	const words = name
		.trim()
		.split(/[\s_-]+/)
		.filter(Boolean);
	const initials = words
		.slice(0, 2)
		.map((word) => word[0]?.toLocaleUpperCase() ?? "")
		.join("");
	return initials || "G";
}

export function SpaceSwitcher({
	spacePath,
	recentSpaces,
	onSelectSpace,
	onOpenSpace,
	onCreateSpace,
}: SpaceSwitcherProps) {
	const { t } = useTranslation("shell");
	const [isPending, setIsPending] = useState(false);
	const current = spacePathParts(spacePath);
	const spaces = [
		spacePath,
		...recentSpaces.filter((path) => path !== spacePath),
	];

	const run = async (action: () => Promise<void>) => {
		if (isPending) return;
		setIsPending(true);
		try {
			await action();
		} finally {
			setIsPending(false);
		}
	};

	return (
		<div className="spaceSwitcher">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="spaceSwitcherTrigger"
						aria-label={t("sidebar.spaceSwitcher")}
						disabled={isPending}
					>
						<span className="spaceSwitcherIcon" aria-hidden="true">
							{spaceMonogram(current.name)}
						</span>
						<span className="spaceSwitcherText">
							<span className="spaceSwitcherName">{current.name}</span>
							<span className="spaceSwitcherPath">{current.parent}</span>
						</span>
						<ChevronUp
							className="spaceSwitcherChevron"
							size="var(--icon-sm)"
							aria-hidden="true"
						/>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="spaceSwitcherMenu"
					side="top"
					align="start"
					sideOffset={3}
				>
					<DropdownMenuLabel className="spaceSwitcherMenuLabel">
						{t("sidebar.spaces")}
					</DropdownMenuLabel>
					{spaces.map((path) => {
						const item = spacePathParts(path);
						const isCurrent = path === spacePath;
						return (
							<DropdownMenuItem
								key={path}
								className="spaceSwitcherMenuItem"
								data-current={isCurrent ? "true" : undefined}
								aria-current={isCurrent ? "true" : undefined}
								onSelect={() => {
									if (isCurrent) return;
									void run(() => onSelectSpace(path));
								}}
							>
								<span
									className="spaceSwitcherMenuMonogram"
									aria-hidden="true"
								>
									{spaceMonogram(item.name)}
								</span>
								<span className="spaceSwitcherMenuItemText">
									<span className="spaceSwitcherMenuItemName">
										{item.name}
									</span>
									<span className="spaceSwitcherMenuItemPath">
										{item.parent}
									</span>
								</span>
								{isCurrent ? (
									<HugeiconsIcon
										icon={Tick02Icon}
										className="spaceSwitcherMenuCheck"
										size="var(--icon-sm)"
										strokeWidth={1.2}
									/>
								) : null}
							</DropdownMenuItem>
						);
					})}
					<DropdownMenuSeparator className="spaceSwitcherMenuSeparator" />
					<DropdownMenuItem
						className="spaceSwitcherMenuAction"
						onSelect={() => void run(onOpenSpace)}
					>
						<span className="spaceSwitcherMenuActionIcon" aria-hidden="true">
							<HugeiconsIcon
								icon={FolderOpenIcon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
						</span>
						{t("sidebar.openAnotherSpace")}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="spaceSwitcherMenuAction"
						onSelect={() => void run(onCreateSpace)}
					>
						<span className="spaceSwitcherMenuActionIcon" aria-hidden="true">
							<HugeiconsIcon
								icon={Folder01Icon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
						</span>
						{t("sidebar.createSpace")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
