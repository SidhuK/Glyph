import { Button } from "../../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "../SettingsScaffold";
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
		<SettingsSection
			title="ChatGPT Account"
			description="Check connection status, sign in, and review Codex usage limits."
			aside={
				<div
					className={`settingsPill ${toneForCodexStatus(codexState.status)}`}
				>
					{labelForCodexStatus(codexState.status)}
				</div>
			}
		>
			<SettingsRow
				label="Identity"
				description="The connected account Glyph is currently using for Codex."
			>
				<div className="settingsHint">
					{codexState.displayName || codexState.email || "Not connected"}
				</div>
			</SettingsRow>
			{codexState.authMode ? (
				<SettingsRow
					label="Authentication"
					description="How this ChatGPT session is currently authenticated."
				>
					<div className="settingsHint">{codexState.authMode}</div>
				</SettingsRow>
			) : null}
			{codexState.rateLimits.length > 0 ? (
				<SettingsRow
					label="Rate limits"
					description="These counters show the remaining capacity for the connected account."
					stacked
				>
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
				</SettingsRow>
			) : null}
			<SettingsRow
				label="Actions"
				description="Sign in, disconnect, or refresh the latest account status."
			>
				<div className="settingsInline">
					{codexState.status === "connected" ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => void onDisconnect()}
							disabled={codexState.loading}
						>
							Disconnect
						</Button>
					) : (
						<Button
							type="button"
							size="sm"
							onClick={() => void onConnect()}
							disabled={codexState.loading}
						>
							Sign In with ChatGPT
						</Button>
					)}
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => void onRefresh()}
						disabled={codexState.loading}
					>
						Refresh Status
					</Button>
				</div>
			</SettingsRow>
			{codexState.error ? (
				<div className="settingsError">{codexState.error}</div>
			) : null}
		</SettingsSection>
	);
}
