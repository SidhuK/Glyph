import { useTranslation } from "react-i18next";
import type { TemplateEntry } from "../../lib/templates";

interface PaletteTemplateActionProps {
	template: TemplateEntry;
	onBack: () => void;
	onCreate: () => void;
}

/** The palette's nested step for a template result: confirm creating a note from it. */
export function PaletteTemplateAction({ template, onBack, onCreate }: PaletteTemplateActionProps) {
	const { t } = useTranslation("shell");
	return (
		<div
			className="commandPaletteSettingEditor"
			onKeyDown={(event) => {
				if (event.key !== "Escape" && event.key !== "ArrowLeft") return;
				event.preventDefault();
				event.stopPropagation();
				onBack();
			}}
		>
			<button type="button" className="commandPaletteBreadcrumb" onClick={onBack}>
				<span className="commandPaletteBackIcon" aria-hidden="true">
					←
				</span>
				<span>{t("commandPalette.templateBreadcrumb")}</span>
			</button>
			<div className="commandPaletteTemplateAction">
				<strong>{template.name.replace(/\.md$/i, "")}</strong>
				<span>{template.relPath}</span>
				<button type="button" className="commandPaletteSettingSave" onClick={onCreate}>
					{t("commandPalette.createFromTemplate")}
				</button>
			</div>
		</div>
	);
}
