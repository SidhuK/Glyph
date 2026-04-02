import { cn } from "@/lib/utils";
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
	const isDark = useIsDarkTheme();

	return (
		<div className="aiHistory">
			<div className="aiHistoryHeader">
				<span>Recent Chats</span>
				<button
					type="button"
					onClick={() => void history.refresh()}
					disabled={history.listLoading}
				>
					Refresh
				</button>
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
								{item.title || "Untitled chat"}
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
				) : (
					<div className="aiHistoryEmpty">
						{history.listLoading ? "Loading chats…" : "No chat history yet"}
					</div>
				)}
			</div>
		</div>
	);
}
