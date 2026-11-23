import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { formatShortcutPartsForPlatform } from "@/lib/shortcuts/platform";
import type { Shortcut } from "@/lib/shortcuts/types";

const TOOLTIP_OPEN_DELAY_MS = 500;
const TOOLTIP_SIDE_OFFSET_PX = 6;

export function TooltipProvider({ children }: { children: ReactNode }) {
	return (
		<TooltipPrimitive.Provider delay={TOOLTIP_OPEN_DELAY_MS}>{children}</TooltipPrimitive.Provider>
	);
}

interface TooltipProps {
	label: string;
	shortcut?: Shortcut | null;
	side?: TooltipPrimitive.Positioner.Props["side"];
	children: ReactElement;
}

export function Tooltip({ label, shortcut, side = "bottom", children }: TooltipProps) {
	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger render={children} />
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Positioner
					className="glyphTooltipPositioner"
					side={side}
					sideOffset={TOOLTIP_SIDE_OFFSET_PX}
				>
					<TooltipPrimitive.Popup className="glyphTooltip">
						<span className="glyphTooltipLabel">{label}</span>
						{shortcut ? (
							<span className="glyphTooltipKeys" aria-hidden="true">
								{formatShortcutPartsForPlatform(shortcut).map((key) => (
									<kbd key={key} className="glyphTooltipKey">
										{key}
									</kbd>
								))}
							</span>
						) : null}
					</TooltipPrimitive.Popup>
				</TooltipPrimitive.Positioner>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	);
}
