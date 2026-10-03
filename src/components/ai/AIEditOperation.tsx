import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiEditOperation, AiEditResolution, AiNoteEditId } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";

interface OperationProps {
	operation: AiEditOperation;
	number: number;
	pending: boolean;
	onResolve: (resolution: AiEditResolution) => void;
}

export const AIEditOperation = memo(function AIEditOperation({
	operation,
	number,
	pending,
	onResolve,
}: OperationProps) {
	const { t } = useTranslation("editor");
	const [openNoteId, setOpenNoteId] = useState<AiNoteEditId | null>(null);
	const disabled = pending || !operation.finished;
	const reviewDisabled = disabled || operation.recovery_required;
	return (
		<section className="aiEditOperation" aria-label={t("aiEdits.operation", { number })}>
			<h4>{t("aiEdits.operation", { number })}</h4>
			{!operation.finished ? <p>{t("aiEdits.running")}</p> : null}
			{operation.recovery_required ? (
				<>
					<p>{t("aiEdits.interrupted")}</p>
					<Button
						disabled={disabled}
						onClick={() =>
							onResolve({
								job_id: operation.job_id,
								decision: { kind: "resume" },
							})
						}
					>
						{t("aiEdits.resume")}
					</Button>
				</>
			) : null}
			{operation.edits.map((edit) => {
				const open = openNoteId === edit.id;
				return (
					<div key={edit.id} className="aiEditNote">
						<button
							type="button"
							aria-expanded={open}
							className="aiEditNoteToggle"
							onClick={() => setOpenNoteId(open ? null : edit.id)}
						>
							{Object.keys(edit.files).join(" · ")} · {t(`aiEdits.${edit.status}`)}
						</button>
						{open ? (
							<>
								{Object.entries(edit.files).map(([path, file]) => (
									<div key={path}>
										<strong>{path}</strong>
										<div className="aiEditVersions">
											<div>
												<h4>{t("aiEdits.before")}</h4>
												<pre>{file.before ?? t("aiEdits.absent")}</pre>
											</div>
											<div>
												<h4>{t("aiEdits.after")}</h4>
												<pre>{file.after ?? t("aiEdits.absent")}</pre>
											</div>
										</div>
									</div>
								))}
								{edit.status === "pending" ? (
									<div className="aiEditActions">
										<Button
											disabled={reviewDisabled}
											onClick={() =>
												onResolve({
													job_id: operation.job_id,
													decision: { kind: "accept", edit_id: edit.id },
												})
											}
										>
											{t("aiEdits.accept")}
										</Button>
										<Button
											variant="ghost"
											disabled={reviewDisabled}
											onClick={() =>
												onResolve({
													job_id: operation.job_id,
													decision: { kind: "reject", edit_id: edit.id },
												})
											}
										>
											{t("aiEdits.reject")}
										</Button>
									</div>
								) : null}
							</>
						) : null}
					</div>
				);
			})}
			{operation.edits.some((edit) => edit.status === "accepted") ? (
				<Button
					variant="ghost"
					disabled={reviewDisabled}
					onClick={() =>
						onResolve({
							job_id: operation.job_id,
							decision: { kind: "undo" },
						})
					}
				>
					{t("aiEdits.undo")}
				</Button>
			) : null}
		</section>
	);
});
