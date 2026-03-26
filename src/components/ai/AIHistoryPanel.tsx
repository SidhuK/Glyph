import { cn } from "@/lib/utils";
import { useIsDarkTheme } from "../../hooks/useIsDarkTheme";
import { ChevronDown } from "../Icons";
import { getProviderLogoSrc } from "./providerLogos";
import type { useAiHistory } from "./useAiHistory";

interface AIHistoryPanelProps {
	history: ReturnType<typeof useAiHistory>;
	historyExpanded: boolean;
	setHistoryExpanded: (
		expanded: boolean | ((prev: boolean) => boolean),
	) => void;
	onLoadHistory: (jobId: string) => void;
}

export function AIHistoryPanel({
	history,
	historyExpanded,
	setHistoryExpanded,
	onLoadHistory,
}: AIHistoryPanelProps) {
	const isDark = useIsDarkTheme();

	return (
		<div className="aiHistory">
			<div className="aiHistoryHeader">
				<button
					type="button"
					className="aiHistoryToggle"
					aria-expanded={historyExpanded}
					onClick={() => setHistoryExpanded((prev: boolean) => !prev)}
				>
					<span>Recent Chats</span>
					<ChevronDown
						size={12}
						className={cn(
							"aiHistoryChevron",
							historyExpanded && "aiHistoryChevron-open",
						)}
					/>
				</button>
				{historyExpanded ? (
					<button
						type="button"
						onClick={() => void history.refresh()}
						disabled={history.listLoading}
					>
						Refresh
					</button>
				) : null}
			</div>
			{historyExpanded ? (
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
			) : null}
		</div>
	);
}
