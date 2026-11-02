import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { Trash2 } from "../../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../ui/shadcn/dropdown-menu";

interface CustomThemeCardMenuProps {
	name: string;
	disabled: boolean;
	onRemove: () => void;
}

/** The "…" button over a custom theme card; shown on hover or keyboard focus. */
export function CustomThemeCardMenu({ name, disabled, onRemove }: CustomThemeCardMenuProps) {
	const { t } = useTranslation("settings.appearance");
	const label = t("themeCards.optionsAriaLabel", { name });
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={
					<button type="button" className="themeCardMenuTrigger" aria-label={label} title={label} />
				}
			>
				<HugeiconsIcon icon={MoreHorizontalIcon} size="var(--icon-sm)" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem variant="destructive" onClick={onRemove}>
					<Trash2 size="var(--icon-sm)" className="glyphMenuItemIcon" aria-hidden="true" />
					<span className="glyphMenuItemLabel">{t("themeCards.remove")}</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
