import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import type { IconSvgElement } from "@hugeicons/react";
import type { MenuRootChangeEventDetails } from "@base-ui/react/menu";
import type { RibbonButtonConfig, RibbonCommandContext } from "./ribbonButtonConfigs";

/** Heavier than the app-wide 1.5 so the bar reads at a glance. */
const RIBBON_ICON_STROKE = 1.9;

export function RibbonIcon({ icon }: { icon: IconSvgElement }) {
	return (
		<HugeiconsIcon
			icon={icon}
			size="var(--icon-md)"
			strokeWidth={RIBBON_ICON_STROKE}
			aria-hidden="true"
		/>
	);
}

/** Keeps the editor's selection when a bar control is pressed. */
export function preventMouseDown(event: React.MouseEvent) {
	event.preventDefault();
}

/**
 * Bar menus move focus into their popup, and closing returns it to the trigger. When the user
 * dismisses one without picking an item, send focus back to the note instead.
 */
export function refocusEditorOnDismiss(ctx: RibbonCommandContext) {
	return (open: boolean, details: MenuRootChangeEventDetails) => {
		if (open) return;
		if (details.reason === "escape-key" || details.reason === "trigger-press") {
			ctx.focusChain().run();
		}
	};
}

interface RibbonButtonProps {
	button: RibbonButtonConfig;
	canEdit: boolean;
}

export function RibbonButton({ button, canEdit }: RibbonButtonProps) {
	const active = button.isActive?.() ?? false;
	return (
		<button
			type="button"
			className={`ribbonBtn ${active ? "active" : ""}`}
			title={button.title}
			aria-label={button.title}
			aria-pressed={button.isActive ? active : undefined}
			disabled={!canEdit}
			onMouseDown={preventMouseDown}
			onClick={() => canEdit && button.onClick()}
		>
			<RibbonIcon icon={button.icon} />
			{button.swatch ? (
				<span className="ribbonSwatchBar" style={{ background: button.swatch }} aria-hidden />
			) : null}
		</button>
	);
}
