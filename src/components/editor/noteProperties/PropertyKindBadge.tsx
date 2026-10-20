import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../../ui/shadcn/dropdown-menu";
import {
	PROPERTY_KINDS,
	PROPERTY_KIND_ICONS,
	PROPERTY_KIND_LABELS,
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
	const label = PROPERTY_KIND_LABELS[resolvedKind];

	if (interactive) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							className="notePropertyKindBadge notePropertyKindTrigger"
							title={`Property type: ${label}`}
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
								<HugeiconsIcon
									icon={PROPERTY_KIND_ICONS[menuKind]}
									size="var(--icon-sm)"
									className="glyphMenuItemIcon"
								/>
								<span className="glyphMenuItemLabel">{PROPERTY_KIND_LABELS[menuKind]}</span>
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
