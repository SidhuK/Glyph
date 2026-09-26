import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AIEditOperation } from "./AIEditOperation";
import { reviewErrorMessage, useAiEditReview } from "./hooks/useAiEditReview";

export function AIEditReview({ supported }: { supported: boolean }) {
	const { t } = useTranslation("editor");
	const { review, resolve, chat, busy } = useAiEditReview();
	const scrollRef = useRef<HTMLDivElement>(null);
	const operations = useMemo(
		() => review.data?.filter((operation) => operation.edits.length > 0) ?? [],
		[review.data],
	);
	const rows = useVirtualizer({
		count: operations.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 160,
		getItemKey: (index) => operations[index]?.job_id ?? index,
		overscan: 2,
	});
	const error = resolve.error ?? review.error;
	return (
		<section className="aiEditReview" aria-label={t("aiEdits.title")}>
			{supported ? (
				<label className="aiEditMode">
					<input
						type="checkbox"
						checked={chat.immediateEdits}
						disabled={busy}
						onChange={(event) => chat.setImmediateEdits(event.target.checked)}
					/>
					{t("aiEdits.immediate")}
				</label>
			) : (
				<p>{t("aiEdits.external")}</p>
			)}
			{supported && !chat.immediateEdits ? <p>{t("aiEdits.proposals")}</p> : null}
			{error ? <p role="alert">{reviewErrorMessage(error)}</p> : null}
			{operations.length > 0 ? (
				<div ref={scrollRef} className="aiEditOperations">
					<div className="aiEditOperationsContent" style={{ height: rows.getTotalSize() }}>
						{rows.getVirtualItems().map((row) => {
							const operation = operations[row.index];
							if (!operation) return null;
							return (
								<div
									key={row.key}
									data-index={row.index}
									ref={rows.measureElement}
									className="aiEditOperationRow"
									style={{ transform: `translateY(${row.start}px)` }}
								>
									<AIEditOperation
										operation={operation}
										number={row.index + 1}
										pending={resolve.isPending}
										onResolve={resolve.mutate}
									/>
								</div>
							);
						})}
					</div>
				</div>
			) : null}
		</section>
	);
}
