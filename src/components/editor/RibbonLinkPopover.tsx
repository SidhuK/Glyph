import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CornerDownLeftIcon, Link2, Unlink02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Toggle } from "../base/toggle/toggle";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { RibbonIcon, preventMouseDown, refocusEditorOnDismiss } from "./RibbonButton";
import { applyEditorLink, removeEditorLink } from "./linkCommands";
import type { RibbonCommandContext } from "./ribbonButtonConfigs";

interface RibbonLinkPopoverProps {
	ctx: RibbonCommandContext;
	canEdit: boolean;
}

export function RibbonLinkPopover({ ctx, canEdit }: RibbonLinkPopoverProps) {
	const { editor, runCommand, focusChain } = ctx;
	const { t } = useTranslation("editor");
	const inputRef = useRef<HTMLInputElement>(null);
	const [linkOpen, setLinkOpen] = useState(false);
	const [linkHref, setLinkHref] = useState("");
	const [hasLink, setHasLink] = useState(false);
	const [linkTarget, setLinkTarget] = useState<"_self" | "_blank">("_self");
	const [linkRange, setLinkRange] = useState<{
		from: number;
		to: number;
	} | null>(null);

	const handleOpenChange = (nextOpen: boolean, details: { reason: string }) => {
		setLinkOpen(nextOpen);
		if (!nextOpen) {
			refocusEditorOnDismiss(ctx)(nextOpen, details);
			return;
		}
		const linkAttrs = editor.getAttributes("link") as {
			href?: string;
			target?: string;
		};
		setLinkHref(linkAttrs.href ?? "");
		setHasLink(Boolean(linkAttrs.href));
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
			<PopoverContent
				className="editorLinkPopover"
				align="start"
				side="top"
				sideOffset={8}
				initialFocus={inputRef}
				finalFocus={false}
			>
				<form
					className="editorLinkField"
					onSubmit={(event) => {
						event.preventDefault();
						applyLink();
					}}
				>
					<HugeiconsIcon
						icon={Link2}
						size="var(--icon-sm)"
						className="editorLinkFieldIcon"
						aria-hidden="true"
					/>
					<input
						ref={inputRef}
						type="text"
						inputMode="url"
						spellCheck={false}
						autoComplete="off"
						value={linkHref}
						onChange={(event) => setLinkHref(event.target.value)}
						placeholder="https://example.com"
						aria-label={t("ribbon.linkUrl")}
					/>
					<button
						type="submit"
						className="editorLinkApply"
						title={t("ribbon.linkApply")}
						aria-label={t("ribbon.linkApply")}
						disabled={!linkHref.trim() && !hasLink}
					>
						<HugeiconsIcon icon={CornerDownLeftIcon} size="var(--icon-sm)" aria-hidden="true" />
					</button>
				</form>
				<div className="editorLinkOptions">
					<Toggle
						size="sm"
						className="editorLinkTargetToggle"
						label={t("ribbon.linkOpenInNewTab")}
						checked={linkTarget === "_blank"}
						onCheckedChange={(checked) => setLinkTarget(checked ? "_blank" : "_self")}
					/>
					{hasLink ? (
						<button type="button" className="editorLinkRemove" onClick={removeLink}>
							<HugeiconsIcon icon={Unlink02Icon} size="var(--icon-sm)" aria-hidden="true" />
							{t("ribbon.linkRemove")}
						</button>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
