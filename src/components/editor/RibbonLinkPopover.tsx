import type { Editor } from "@tiptap/core";
import { m } from "motion/react";
import { useState } from "react";
import { Link2, X } from "../Icons";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { applyEditorLink, removeEditorLink } from "./linkCommands";

interface RibbonLinkPopoverProps {
	editor: Editor;
	canEdit: boolean;
	runCommand: (fn: () => void) => void;
	focusChain: () => ReturnType<Editor["chain"]>;
	preventMouseDown: (e: React.MouseEvent) => void;
}

export function RibbonLinkPopover({
	editor,
	canEdit,
	runCommand,
	focusChain,
	preventMouseDown,
}: RibbonLinkPopoverProps) {
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
			<PopoverTrigger asChild>
				<m.button
					type="button"
					className={`ribbonBtn ${editor.isActive("link") ? "active" : ""}`}
					title="Link"
					aria-label="Link"
					disabled={!canEdit}
					onMouseDown={preventMouseDown}
					onClick={() => canEdit && setLinkOpen(true)}
					whileTap={canEdit ? { scale: 0.97 } : undefined}
					transition={springPresets.snappy}
				>
					<Link2 size="var(--icon-md)" />
				</m.button>
			</PopoverTrigger>
			<PopoverContent
				className="editorLinkPopover"
				align="start"
				side="top"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
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
						aria-label="Link URL"
					/>
				</div>
				<label className="editorLinkPopoverCheckbox">
					<input
						type="checkbox"
						checked={linkTarget === "_blank"}
						onChange={(event) =>
							setLinkTarget(event.target.checked ? "_blank" : "_self")
						}
					/>
					<span>Open in new tab</span>
				</label>
				<div className="editorLinkPopoverActions">
					<Button type="button" variant="ghost" size="sm" onClick={removeLink}>
						<X size="var(--icon-md)" />
						Remove
					</Button>
					<Button type="button" size="sm" onClick={applyLink}>
						Apply
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
