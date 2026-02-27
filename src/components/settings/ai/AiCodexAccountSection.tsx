import {
	clampPercent,
	formatResetMessage,
	labelForCodexStatus,
	toneForCodexStatus,
	toneForRateLimitUsed,
} from "./aiProfileSectionUtils";

interface AiCodexAccountSectionProps {
	codexState: {
		status: string;
		email: string | null;
		displayName: string | null;
		authMode: string | null;
		rateLimits: Array<{
			key: string;
			label: string;
			usedPercent: number;
			windowMinutes: number | null;
			resetsAt: number | null;
		}>;
		error: string;
		loading: boolean;
	};
	nowMs: number;
	onConnect: () => Promise<void>;
	onDisconnect: () => Promise<void>;
	onRefresh: () => Promise<void>;
}

export function AiCodexAccountSection({
	codexState,
	nowMs,
	onConnect,
	onDisconnect,
	onRefresh,
}: AiCodexAccountSectionProps) {
	return (
		<section className="settingsCard">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">ChatGPT Account</div>
					<div className="settingsCardHint">
						Check connection status and usage limits.
					</div>
				</div>
				<div
					className={`settingsPill ${toneForCodexStatus(codexState.status)}`}
				>
					{labelForCodexStatus(codexState.status)}
				</div>
			</div>
			<div className="settingsField">
				<div className="settingsLabel">Identity</div>
				<div className="settingsHint">
					{codexState.displayName || codexState.email || "Not connected"}
				</div>
			</div>
			{codexState.authMode ? (
				<div className="settingsField">
					<div className="settingsLabel">Authentication</div>
					<div className="settingsHint">{codexState.authMode}</div>
				</div>
			) : null}
			{codexState.rateLimits.length > 0 ? (
				<div className="settingsField">
					<div className="settingsLabel">Rate Limits</div>
					<div className="codexRateLimitList">
						{codexState.rateLimits.map((item) => {
							const remainingPercent = clampPercent(100 - item.usedPercent);
							const tone = toneForRateLimitUsed(item.usedPercent);
							const batteryCellCount = 12;
							const activeBatteryCells = Math.round(
								(remainingPercent / 100) * batteryCellCount,
							);
							return (
								<div
									key={item.key}
									className={`codexRateLimitItem codexRateLimitItem--${tone}`}
								>
									<div className="codexRateLimitRow">
										<span className="codexRateLimitWindow">{item.label}</span>
									</div>
									<div className="codexRateLimitMeasureRow">
										<progress
											className="sr-only"
											value={Math.round(remainingPercent)}
											max={100}
											aria-label={`${item.label} remaining`}
										/>
										<div className="codexRateLimitBattery" aria-hidden="true">
											<div className="codexRateLimitBatteryBody">
												{Array.from({ length: batteryCellCount }).map(
													(_, index) => (
														<div
															key={`${item.key}-battery-cell-${index.toString()}`}
															className={`codexRateLimitBatteryCell ${index < activeBatteryCells ? "codexRateLimitBatteryCell--active" : ""}`}
														/>
													),
												)}
											</div>
											<div
												className="codexRateLimitBatteryCap"
												aria-hidden="true"
											/>
										</div>
										<div className="codexRateLimitStats">
											<div className="codexRateLimitRemainingValue">
												{`${remainingPercent.toFixed(1)}% left`}
											</div>
											<div className="codexRateLimitMeta">
												<div className="codexRateLimitResetMeta">
													{formatResetMessage(item.resetsAt, nowMs)}
												</div>
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			) : null}
			<div className="settingsInline">
				{codexState.status === "connected" ? (
					<button
						type="button"
						onClick={() => void onDisconnect()}
						disabled={codexState.loading}
					>
						Disconnect
					</button>
				) : (
					<button
						type="button"
						onClick={() => void onConnect()}
						disabled={codexState.loading}
					>
						Sign In with ChatGPT
					</button>
				)}
				<button
					type="button"
					onClick={() => void onRefresh()}
					disabled={codexState.loading}
				>
					Refresh Status
				</button>
			</div>
			{codexState.error ? (
				<div className="settingsError">{codexState.error}</div>
			) : null}
		</section>
	);
}
