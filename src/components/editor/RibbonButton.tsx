import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import type { IconSvgElement } from "@hugeicons/react";
import type { RibbonButtonConfig, RibbonCommandContext } from "./ribbonButtonConfigs";

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

export function preventMouseDown(event: React.MouseEvent) {
	event.preventDefault();
}

export function refocusEditorOnDismiss(ctx: RibbonCommandContext) {
	return (open: boolean, details: { reason: string }) => {
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
