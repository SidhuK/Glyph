import katex from "katex";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/shadcn/button";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "../../ui/shadcn/popover";
import type { MathEditRequest } from "../extensions/math/mathOptions";
import { GLYPH_KATEX_OPTIONS } from "../extensions/math/mathOptions";
import { LatexSourceEditor } from "./LatexSourceEditor";

interface MathNodeEditorProps {
	anchorRect: DOMRect | null;
	onApply: (latex: string) => void;
	onCancel: () => void;
	onDelete: () => void;
	request: MathEditRequest;
}

export function MathNodeEditor({
	anchorRect,
	onApply,
	onCancel,
	onDelete,
	request,
}: MathNodeEditorProps) {
	const { t } = useTranslation("ui");
	const [draft, setDraft] = useState(request.latex);
	const previewRef = useRef<HTMLDivElement | null>(null);
	const [renderError, setRenderError] = useState("");
	const anchorStyle = useMemo(
		() => ({
			left: anchorRect?.left ?? window.innerWidth / 2,
			top: anchorRect?.top ?? window.innerHeight / 2,
			width: Math.max(anchorRect?.width ?? 1, 1),
			height: Math.max(anchorRect?.height ?? 1, 1),
		}),
		[anchorRect],
	);

	useEffect(() => {
		const preview = previewRef.current;
		if (!preview) return;
		const frame = window.requestAnimationFrame(() => {
			try {
				katex.render(draft || "\\;", preview, {
					...GLYPH_KATEX_OPTIONS,
					displayMode: request.kind === "block",
					throwOnError: true,
				});
				setRenderError("");
			} catch (error: unknown) {
				preview.textContent = draft;
				setRenderError(
					error instanceof Error ? error.message : t("math.invalidLatex"),
				);
			}
		});
		return () => window.cancelAnimationFrame(frame);
	}, [draft, request.kind, t]);

	return (
		<Popover open onOpenChange={(open) => !open && onCancel()}>
			<PopoverTrigger asChild>
				<span
					className="mathNodeEditorAnchor"
					style={anchorStyle}
					aria-hidden
				/>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="mathNodeEditorPopover"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<PopoverHeader>
					<PopoverTitle>
						{request.kind === "inline"
							? t("math.inlineEquation")
							: t("math.displayEquation")}
					</PopoverTitle>
					<PopoverDescription>{t("math.description")}</PopoverDescription>
				</PopoverHeader>
				<LatexSourceEditor
					key={`${request.kind}:${request.pos}`}
					multiline={request.kind === "block"}
					value={request.latex}
					onChange={setDraft}
					onApply={(latex) => onApply(latex)}
					onCancel={onCancel}
				/>
				<div
					ref={previewRef}
					className="mathNodeEditorPreview"
					data-error={renderError ? "true" : undefined}
					aria-label={t("math.previewAriaLabel")}
				/>
				{renderError ? (
					<output className="mathNodeEditorError">{renderError}</output>
				) : null}
				<div className="mathNodeEditorActions">
					<Button
						type="button"
						size="sm"
						variant="destructive"
						onClick={onDelete}
					>
						{t("math.delete")}
					</Button>
					<span className="mathNodeEditorActionsSpacer" />
					<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
						{t("common.cancel")}
					</Button>
					<Button type="button" size="sm" onClick={() => onApply(draft)}>
						{t("common.apply")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
