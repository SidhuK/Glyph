import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	getDatabaseColumnIconOption,
	resolveDatabaseColumnIconName,
} from "../../lib/database/columnIcons";
import type { DatabaseColumn } from "../../lib/database/types";

interface DatabaseColumnIconProps {
	column?: Pick<DatabaseColumn, "type" | "property_kind" | "icon">;
	iconName?: string | null;
	size?: number;
	className?: string;
}

function iconDefinition(iconName: string) {
	const option = getDatabaseColumnIconOption(iconName);
	if (!option) return Icons.Document;
	return Icons[option.iconKey as keyof typeof Icons];
}

export function DatabaseColumnIcon({
	column,
	iconName,
	size = 14,
	className,
}: DatabaseColumnIconProps) {
	const resolvedIconName =
		iconName ?? (column ? resolveDatabaseColumnIconName(column) : "document");
	return (
		<HugeiconsIcon
			icon={iconDefinition(resolvedIconName)}
			size={size}
			className={className}
		/>
	);
}
