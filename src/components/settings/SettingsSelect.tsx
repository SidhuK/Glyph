import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "../Icons";

type SettingsSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function SettingsSelect({
	className,
	children,
	...props
}: SettingsSelectProps) {
	return (
		<span className="settingsSelectWrap">
			<select className={cn("settingsSelectNative", className)} {...props}>
				{children}
			</select>
			<ChevronDown
				className="settingsSelectChevron"
				size="var(--icon-sm)"
				aria-hidden="true"
			/>
		</span>
	);
}
