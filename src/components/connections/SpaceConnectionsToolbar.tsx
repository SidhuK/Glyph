import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Search01Icon, SlidersVerticalIcon } from "@hugeicons/core-free-icons";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectionsGraphOptions } from "../../lib/connectionsGraphOptions";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { SpaceConnectionsOptionsPopover } from "./SpaceConnectionsOptionsPopover";

interface SpaceConnectionsToolbarProps {
	searchOpen: boolean;
	searchQuery: string;
	onSearchOpenChange: (open: boolean) => void;
	onSearchQueryChange: (query: string) => void;
	searchInputRef?: RefObject<HTMLInputElement | null>;
	options: ConnectionsGraphOptions;
	onOptionsChange: (options: ConnectionsGraphOptions) => void;
}

export function SpaceConnectionsToolbar({
	searchOpen,
	searchQuery,
	onSearchOpenChange,
	onSearchQueryChange,
	searchInputRef,
	options,
	onOptionsChange,
}: SpaceConnectionsToolbarProps) {
	const { t } = useTranslation("shell");

	return (
		<div className="spaceConnectionsToolbar">
			{searchOpen ? (
				<Input
					ref={searchInputRef}
					autoFocus
					value={searchQuery}
					onChange={(event) => onSearchQueryChange(event.target.value)}
					placeholder={t("connections.searchPlaceholder")}
					aria-label={t("connections.searchAria")}
					className="spaceConnectionsSearchInput"
				/>
			) : null}
			<Button
				type="button"
				size="icon-sm"
				variant="ghost"
				static
				aria-label={t("connections.searchAria")}
				aria-pressed={searchOpen}
				onClick={() => onSearchOpenChange(!searchOpen)}
			>
				<HugeiconsIcon icon={Search01Icon} size="var(--icon-md)" />
			</Button>
			<SpaceConnectionsOptionsPopover
				options={options}
				onOptionsChange={onOptionsChange}
				trigger={
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						static
						aria-label={t("connections.optionsAria")}
					>
						<HugeiconsIcon icon={SlidersVerticalIcon} size="var(--icon-md)" />
					</Button>
				}
			/>
		</div>
	);
}
