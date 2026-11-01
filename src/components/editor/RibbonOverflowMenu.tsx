import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuItemIcon,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import {
	EraserIcon,
	HighlighterIcon,
	MoreVerticalIcon,
	NoteAddIcon,
	TextClearIcon,
	TextColorIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { RibbonIcon, preventMouseDown, refocusEditorOnDismiss } from "./RibbonButton";
import { RibbonMenuItem } from "./RibbonMenu";
import {
	type RibbonCommandContext,
	type RibbonSwatchGroup,
	getOverflowSections,
	getTextColorGroup,
	getTextHighlightGroup,
} from "./ribbonButtonConfigs";

interface SwatchSubmenuProps {
	group: RibbonSwatchGroup;
	icon: IconSvgElement;
	clearIcon: IconSvgElement;
	/** Text colours tint the letter; highlights tint behind it, as they do in the note. */
	paint: "text" | "background";
}

function SwatchSubmenu({ group, icon, clearIcon, paint }: SwatchSubmenuProps) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<DropdownMenuItemIcon icon={icon} />
				<span className="glyphMenuItemLabel">{group.title}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent finalFocus={false}>
				{group.options.map((option) => {
					const value = `var(${option.cssVar}, ${option.fallbackHex})`;
					return (
						<DropdownMenuItem key={option.id} onClick={option.onSelect}>
							<span
								className="ribbonSwatchGlyph"
								style={paint === "text" ? { color: value } : { background: value }}
								aria-hidden
							>
								A
							</span>
							<span className="glyphMenuItemLabel">{option.label}</span>
							{group.activeId === option.id ? <DropdownMenuItemCheck /> : null}
						</DropdownMenuItem>
					);
				})}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={group.onClear}>
					<DropdownMenuItemIcon icon={clearIcon} />
					<span className="glyphMenuItemLabel">{group.clearTitle}</span>
				</DropdownMenuItem>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

interface RibbonOverflowMenuProps {
	ctx: RibbonCommandContext;
	canEdit: boolean;
	onExtractSelectionToNote?: () => void;
}

/** ⋮ menu: less frequent marks and blocks, colours, and selection actions. */
export function RibbonOverflowMenu({
	ctx,
	canEdit,
	onExtractSelectionToNote,
}: RibbonOverflowMenuProps) {
	const { t } = useTranslation("editor");
	return (
		<DropdownMenu onOpenChange={refocusEditorOnDismiss(ctx)}>
			<DropdownMenuTrigger
				disabled={!canEdit}
				render={
					<button
						type="button"
						className="ribbonBtn"
						title={t("ribbon.more")}
						aria-label={t("ribbon.more")}
						onMouseDown={preventMouseDown}
					/>
				}
			>
				<RibbonIcon icon={MoreVerticalIcon} />
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="end" finalFocus={false}>
				{getOverflowSections(ctx).map((section) => (
					<Fragment key={section[0]?.title}>
						{section.map((item) => (
							<RibbonMenuItem key={item.title} item={item} />
						))}
						<DropdownMenuSeparator />
					</Fragment>
				))}
				<SwatchSubmenu
					group={getTextColorGroup(ctx)}
					icon={TextColorIcon}
					clearIcon={TextClearIcon}
					paint="text"
				/>
				<SwatchSubmenu
					group={getTextHighlightGroup(ctx)}
					icon={HighlighterIcon}
					clearIcon={EraserIcon}
					paint="background"
				/>
				{onExtractSelectionToNote ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onExtractSelectionToNote}>
							<DropdownMenuItemIcon icon={NoteAddIcon} />
							<span className="glyphMenuItemLabel">{t("ribbon.extractToNote")}</span>
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
