import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { RecoveryPreview as Preview } from "../../lib/tauri";

export const RecoveryPreview = memo(function RecoveryPreview({ preview }: { preview: Preview }) {
	const { t } = useTranslation("editor");
	const currentText = preview.current.kind === "present" ? preview.current.text : null;
	// Highlight the changed range between the shared opening and closing lines.
	const comparison = useMemo(() => {
		const current = (currentText ?? "").split(/(?<=\n)/);
		const saved = preview.text.split(/(?<=\n)/);
		let start = 0;
		while (start < current.length && start < saved.length && current[start] === saved[start]) {
			start++;
		}
		let end = 0;
		while (
			end < current.length - start &&
			end < saved.length - start &&
			current[current.length - end - 1] === saved[saved.length - end - 1]
		) {
			end++;
		}
		const parts = (lines: string[]) => ({
			before: lines.slice(0, start).join(""),
			changed: lines.slice(start, lines.length - end).join(""),
			after: end ? lines.slice(-end).join("") : "",
		});
		return { current: parts(current), saved: parts(saved) };
	}, [currentText, preview.text]);
	return (
		<div className="grid min-h-0 grid-cols-2 gap-3">
			<section className="min-w-0">
				<h3>{t("recovery.current")}</h3>
				<pre className="h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs">
					{currentText === null ? (
						t("recovery.missing")
					) : (
						<>
							{comparison.current.before}
							<span className="bg-red-500/15">{comparison.current.changed}</span>
							{comparison.current.after}
						</>
					)}
				</pre>
			</section>
			<section className="min-w-0">
				<h3>{t("recovery.saved")}</h3>
				<pre className="h-64 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs">
					{comparison.saved.before}
					<span className="bg-green-500/15">{comparison.saved.changed}</span>
					{comparison.saved.after}
				</pre>
			</section>
		</div>
	);
});
