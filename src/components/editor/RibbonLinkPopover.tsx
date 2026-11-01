import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2 } from "@hugeicons/core-free-icons";
import { X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { RibbonIcon, preventMouseDown } from "./RibbonButton";
import { applyEditorLink, removeEditorLink } from "./linkCommands";
import type { RibbonCommandContext } from "./ribbonButtonConfigs";

interface RibbonLinkPopoverProps {
	ctx: RibbonCommandContext;
	canEdit: boolean;
}

export function RibbonLinkPopover({ ctx, canEdit }: RibbonLinkPopoverProps) {
	const { editor, runCommand, focusChain } = ctx;
	const { t } = useTranslation("editor");
	const [linkOpen, setLinkOpen] = useState(false);
	const [linkHref, setLinkHref] = useState("");
	const [linkTarget, setLinkTarget] = useState<"_self" | "_blank">("_self");
	const [linkRange, setLinkRange] = useState<{
		from: number;
		to: number;
	} | null>(null);

	const handleOpenChange = (nextOpen: boolean) => {
		setLinkOpen(nextOpen);
		if (!nextOpen) return;
		const linkAttrs = editor.getAttributes("link") as {
			href?: string;
			target?: string;
		};
		setLinkHref(linkAttrs.href ?? "");
		setLinkTarget(linkAttrs.target === "_blank" ? "_blank" : "_self");
		const { from, to } = editor.state.selection;
		setLinkRange({ from, to });
	};

	const applyLink = () => {
		runCommand(() => {
			applyEditorLink(focusChain(), {
				href: linkHref,
				range: linkRange,
				target: linkTarget,
			});
		});
		setLinkOpen(false);
	};

	const removeLink = () => {
		runCommand(() => {
			removeEditorLink(focusChain(), linkRange);
		});
		setLinkOpen(false);
	};

	return (
		<Popover open={linkOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				disabled={!canEdit}
				render={
					<button
						type="button"
						className={`ribbonBtn ${editor.isActive("link") ? "active" : ""}`}
						title={t("ribbon.link")}
						aria-label={t("ribbon.link")}
						onMouseDown={preventMouseDown}
					/>
				}
			>
				<RibbonIcon icon={Link2} />
			</PopoverTrigger>
			<PopoverContent className="editorLinkPopover" align="start" side="top" initialFocus={false}>
				<div className="editorLinkPopoverRow">
					<Input
						value={linkHref}
						onChange={(event) => setLinkHref(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								applyLink();
							}
						}}
						placeholder="https://example.com"
						aria-label={t("ribbon.linkUrl")}
					/>
				</div>
				<label className="editorLinkPopoverCheckbox">
					<input
						type="checkbox"
						checked={linkTarget === "_blank"}
						onChange={(event) => setLinkTarget(event.target.checked ? "_blank" : "_self")}
					/>
					<span>{t("ribbon.linkOpenInNewTab")}</span>
				</label>
				<div className="editorLinkPopoverActions">
					<Button type="button" variant="ghost" size="sm" onClick={removeLink}>
						<X size="var(--icon-md)" />
						{t("ribbon.linkRemove")}
					</Button>
					<Button type="button" size="sm" onClick={applyLink}>
						{t("ribbon.linkApply")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
