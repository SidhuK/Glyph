import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { useTranslation } from "react-i18next";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItemIcon,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../../ui/shadcn/dropdown-menu";
import {
	PROPERTY_KINDS,
	PROPERTY_KIND_ICONS,
	type PropertyKind,
	isPropertyKind,
} from "./constants";

interface PropertyKindBadgeProps {
	kind: string;
	interactive?: boolean;
	onSelect?: (kind: PropertyKind) => void;
}

export function PropertyKindBadge({ kind, interactive = false, onSelect }: PropertyKindBadgeProps) {
	const resolvedKind = isPropertyKind(kind) ? kind : "text";
	const icon = PROPERTY_KIND_ICONS[resolvedKind];
	const { t } = useTranslation("editor");

	if (interactive) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							className="notePropertyKindBadge notePropertyKindTrigger"
							title={t("propertyKind.title", { label: t(`propertyKind.kinds.${resolvedKind}`) })}
						/>
					}
				>
					<HugeiconsIcon icon={icon} size="var(--icon-sm)" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" sideOffset={6}>
					<DropdownMenuRadioGroup
						value={resolvedKind}
						onValueChange={(value) => {
							if (typeof value === "string" && isPropertyKind(value)) onSelect?.(value);
						}}
					>
						{PROPERTY_KINDS.map((menuKind) => (
							<DropdownMenuRadioItem key={menuKind} value={menuKind} closeOnClick>
								<DropdownMenuItemIcon icon={PROPERTY_KIND_ICONS[menuKind]} />
								<span className="glyphMenuItemLabel">{t(`propertyKind.kinds.${menuKind}`)}</span>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<div className="notePropertyKindBadge">
			<HugeiconsIcon icon={icon} size="var(--icon-sm)" />
		</div>
	);
}
