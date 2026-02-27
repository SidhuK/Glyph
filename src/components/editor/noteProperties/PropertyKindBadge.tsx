import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronDown } from "../../Icons";
import { Button } from "../../ui/shadcn/button";
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

export function PropertyKindBadge({
	kind,
	interactive = false,
	onSelect,
}: PropertyKindBadgeProps) {
	const resolvedKind = isPropertyKind(kind) ? kind : "text";
	const icon = PROPERTY_KIND_ICONS[resolvedKind];
	const label = PROPERTY_KIND_LABELS[resolvedKind];

	if (interactive) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						size="xs"
						variant="ghost"
						className="notePropertyKindBadge notePropertyKindTrigger"
						title={`Property type: ${label}`}
					>
						<HugeiconsIcon icon={icon} size={14} />
						<span>{label}</span>
						<ChevronDown size={12} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					sideOffset={6}
					className="notePropertyKindMenu"
				>
					<DropdownMenuRadioGroup
						value={resolvedKind}
						onValueChange={(value) => onSelect?.(value as PropertyKind)}
					>
						{PROPERTY_KINDS.map((menuKind) => (
							<DropdownMenuRadioItem
								key={menuKind}
								value={menuKind}
								className="notePropertyKindOption"
							>
								<span className="notePropertyKindOptionIcon">
									<HugeiconsIcon
										icon={PROPERTY_KIND_ICONS[menuKind]}
										size={14}
									/>
								</span>
								<span className="notePropertyKindOptionLabel">
									{PROPERTY_KIND_LABELS[menuKind]}
								</span>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<div className="notePropertyKindBadge">
			<HugeiconsIcon icon={icon} size={14} />
			<span>{label}</span>
		</div>
	);
}
