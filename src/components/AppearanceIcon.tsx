import { isAppearanceEmoji } from "../lib/appearanceEmoji";
import { DatabaseColumnIcon } from "./database/DatabaseColumnIcon";

interface AppearanceIconProps {
	iconName: string;
	size?: string | number;
	strokeWidth?: number;
	className?: string;
}

/** Renders a user-chosen appearance icon: a native emoji glyph or a built-in icon id. */
export function AppearanceIcon({
	iconName,
	size = "var(--icon-md)",
	strokeWidth,
	className,
}: AppearanceIconProps) {
	if (isAppearanceEmoji(iconName)) {
		return (
			<span
				className={className ? `appearanceEmoji ${className}` : "appearanceEmoji"}
				style={{ width: size, height: size, fontSize: size }}
				aria-hidden="true"
			>
				{iconName}
			</span>
		);
	}
	return (
		<DatabaseColumnIcon
			iconName={iconName}
			size={size}
			strokeWidth={strokeWidth}
			className={className}
		/>
	);
}
