import { Toaster as SileoToaster } from "sileo";

function Toaster() {
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
