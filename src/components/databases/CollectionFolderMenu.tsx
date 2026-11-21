import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowDown01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { CollectionFolder } from "../../hooks/database/useCollectionFolders";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItemIcon,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

interface CollectionFolderMenuProps {
	folders: CollectionFolder[];
	value: string;
	onChange: (path: string) => void;
	spaceName: string;
	disabled: boolean;
}

function folderLabel(path: string): string {
	return path.split("/").filter(Boolean).join(" / ");
}

export function CollectionFolderMenu({
	folders,
	value,
	onChange,
	spaceName,
	disabled,
}: CollectionFolderMenuProps) {
	const { t } = useTranslation("shell");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="collectionCreatorFolderTrigger"
				aria-label={t("collections.creator.folder")}
				disabled={disabled}
			>
				<HugeiconsIcon icon={Folder01Icon} size="var(--icon-sm)" aria-hidden="true" />
				<span className="collectionCreatorFolderName">{folderLabel(value)}</span>
				<HugeiconsIcon
					icon={ArrowDown01Icon}
					size="var(--icon-sm)"
					className="collectionCreatorFolderChevron"
					aria-hidden="true"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" className="collectionCreatorFolderMenu">
				<DropdownMenuLabel>
					{t("collections.creator.foldersIn", { space: spaceName })}
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={value} onValueChange={(next: string) => onChange(next)}>
					{folders.map((folder) => (
						<DropdownMenuRadioItem key={folder.path} value={folder.path}>
							<DropdownMenuItemIcon icon={Folder01Icon} />
							<span className="collectionCreatorFolderMenuName">{folderLabel(folder.path)}</span>
							<span className="collectionCreatorFolderMenuCount">{folder.noteCount}</span>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
