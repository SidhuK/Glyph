import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	ArrowDown01Icon,
	CodeSimpleIcon,
	Copy01Icon,
	Csv01Icon,
	Txt01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemIcon,
	DropdownMenuTrigger,
} from "../../ui/shadcn/dropdown-menu";
import type { TableCopyFormat } from "./tableClipboard";
import type { TableCopyControlProps } from "./useTableCopyControl";

const MENU_FORMATS = [
	{ format: "markdown", labelKey: "tableControls.copyAsMarkdown", icon: CodeSimpleIcon },
	{ format: "csv", labelKey: "tableControls.copyAsCsv", icon: Csv01Icon },
	{ format: "tsv", labelKey: "tableControls.copyAsTsv", icon: Txt01Icon },
] as const satisfies readonly {
	format: Exclude<TableCopyFormat, "rich">;
	labelKey: string;
	icon: IconSvgElement;
}[];

function keepEditorSelection(event: React.MouseEvent<HTMLElement>) {
	event.preventDefault();
}

export const TableCopyControl = memo(function TableCopyControl({
	right,
	top,
	onCopy,
	onMenuOpenChange,
}: TableCopyControlProps) {
	const { t } = useTranslation("editor");
	const optionsLabel = t("tableControls.copyOptions");

	return (
		<div className="tableCopyControl" style={{ left: `${right}px`, top: `${top}px` }}>
			<button
				type="button"
				className="tableCopyBtn"
				aria-label={t("tableControls.copyTable")}
				title={t("tableControls.copyTable")}
				onMouseDown={keepEditorSelection}
				onClick={() => onCopy("rich")}
			>
				<HugeiconsIcon icon={Copy01Icon} size="var(--icon-sm)" />
			</button>
			<DropdownMenu onOpenChange={onMenuOpenChange}>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							className="tableCopyBtn is-options"
							aria-label={optionsLabel}
							title={optionsLabel}
							onMouseDown={keepEditorSelection}
						>
							<HugeiconsIcon icon={ArrowDown01Icon} size="var(--icon-xs)" />
						</button>
					}
				/>
				<DropdownMenuContent className="tableInlineControlsMenu" align="end">
					{MENU_FORMATS.map((item) => (
						<DropdownMenuItem key={item.format} onClick={() => onCopy(item.format)}>
							<DropdownMenuItemIcon icon={item.icon} />
							<span className="glyphMenuItemLabel">{t(item.labelKey)}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
});
