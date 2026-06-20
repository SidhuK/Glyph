import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useIsDarkTheme } from "../../hooks/useIsDarkTheme";
import { getProviderLogoSrc } from "./providerLogos";
import type { useAiHistory } from "./useAiHistory";

interface AIHistoryPanelProps {
	history: ReturnType<typeof useAiHistory>;
	onLoadHistory: (jobId: string) => void;
}

export function AIHistoryPanel({
	history,
	onLoadHistory,
}: AIHistoryPanelProps) {
	const { t } = useTranslation("ui");
	const isDark = useIsDarkTheme();

	return (
		<div className="aiHistory">
			<div className="aiHistoryHeader">
				<span>{t("ai.recentChats")}</span>
			</div>
			<div className="aiHistoryList">
				{history.summaries.length > 0 ? (
					history.summaries.map((item) => (
						<button
							key={item.job_id}
							type="button"
							className={cn(
								"aiHistoryItem",
								history.selectedJobId === item.job_id && "active",
							)}
							onClick={() => onLoadHistory(item.job_id)}
							disabled={history.loadingJobId === item.job_id}
						>
							<div className="aiHistoryItemTitle">
								{item.title || t("ai.untitledChat")}
							</div>
							{item.provider ? (
								<img
									className="aiHistoryProviderIcon"
									src={getProviderLogoSrc(item.provider, isDark)}
									alt={item.provider}
									draggable={false}
								/>
							) : null}
						</button>
					))
				) : history.listLoading ? null : (
					<div className="aiHistoryEmpty">{t("ai.noHistory")}</div>
				)}
			</div>
		</div>
	);
}
