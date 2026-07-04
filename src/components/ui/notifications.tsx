import { useEffect } from "react";
import type { SileoPosition } from "sileo";
import { Toaster as SileoToaster } from "sileo";
import { toast } from "../../lib/toast";

const SILEO_POSITIONS = [
	"top-left",
	"top-center",
	"top-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
] as const satisfies readonly SileoPosition[];

function isSileoPosition(position: string): position is SileoPosition {
	return SILEO_POSITIONS.includes(position as SileoPosition);
}

function Toaster() {
	useEffect(() => {
		const dismissExpandedToast = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (target.closest("[data-sileo-button]")) return;
			const expandedToast = target.closest(
				'[data-sileo-toast][data-expanded="true"]',
			);
			if (!expandedToast) return;
			const viewport = expandedToast.closest("[data-sileo-viewport]");
			const position = viewport?.getAttribute("data-position");
			if (position && isSileoPosition(position)) {
				toast.clear(position);
			} else {
				toast.clear();
			}
		};

		document.addEventListener("click", dismissExpandedToast, true);
		return () => {
			document.removeEventListener("click", dismissExpandedToast, true);
		};
	}, []);

	return (
		<SileoToaster
			position="top-center"
			options={{
				duration: 5200,
				fill: "var(--glyph-toast-fill)",
				roundness: 14,
				autopilot: { expand: 180, collapse: 3600 },
				styles: {
					title: "glyphToastTitle",
					description: "glyphToastDescription",
					badge: "glyphToastBadge",
					button: "glyphToastButton",
				},
			}}
		/>
	);
}

export { Toaster };
