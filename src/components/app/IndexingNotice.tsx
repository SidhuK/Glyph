import { useState } from "react";
import type { IndexProgress } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";

export function IndexingNotice() {
	const [progress, setProgress] = useState<IndexProgress | null>(null);
	useTauriEvent("index:progress", setProgress);
	const total = progress?.total ?? 0;
	const completed = progress?.completed ?? 0;
	const percentage = total > 0 ? Math.min(100, (completed / total) * 100) : 0;

	return (
		<output className="indexingNotice" aria-live="polite">
			<div className="indexingNoticeCopy">
				<strong>Indexing your space</strong>
				<span>
					{total > 0
						? `${completed.toLocaleString()} of ${total.toLocaleString()} notes`
						: "Checking for note changes…"}
				</span>
			</div>
			<div className="indexingNoticeTrack" aria-hidden="true">
				<div
					className={
						total > 0 ? "indexingNoticeBar" : "indexingNoticeBar is-pending"
					}
					style={total > 0 ? { width: `${percentage}%` } : undefined}
				/>
			</div>
		</output>
	);
}
