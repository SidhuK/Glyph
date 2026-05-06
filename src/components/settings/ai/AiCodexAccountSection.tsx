import { Calendar03Icon, Time04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
}

const rateLimitSegmentCount = 12;

function formatRateLimitLabel(
	label: string,
	windowMinutes: number | null,
): string {
	if (windowMinutes === 10080) return "Weekly";
	if (windowMinutes != null && Number.isFinite(windowMinutes)) {
		if (windowMinutes >= 60 && windowMinutes % 60 === 0) {
			return `${windowMinutes / 60}hr`;
		}
		return `${windowMinutes}m`;
	}
	return label
		.replace(/\s*window$/i, "")
		.replace("-hour", "hr")
		.replace("-minute", "m");
}

function formatResetCell(timestamp: number | null, nowMs: number): string {
	const resetMessage = formatResetMessage(timestamp, nowMs);
	return resetMessage.startsWith("Resets in ")
		? resetMessage.replace("Resets in ", "")
		: resetMessage;
}

export function AiCodexAccountSection({
	codexState,
	nowMs,
	onConnect,
	onDisconnect,
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
				interactive={false}
			>
				<div className="settingsInline">
					<div className="settingsHint">
						{codexState.displayName || codexState.email || "Not connected"}
					</div>
					{codexState.status === "connected" ? (
						<>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => void onDisconnect()}
								disabled={codexState.loading}
							>
								Disconnect
							</Button>
						</>
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
				</div>
			</SettingsRow>
			{codexState.authMode ? (
				<SettingsRow
					label="Authentication"
					description="How this ChatGPT session is currently authenticated."
					interactive={false}
				>
					<div className="settingsHint">{codexState.authMode}</div>
				</SettingsRow>
			) : null}
			{codexState.rateLimits.length > 0 ? (
				<SettingsRow
					label="Rate limits"
					description="These counters show the remaining capacity for the connected account."
					stacked
					interactive={false}
				>
					<div className="codexRateLimitTableWrap">
						<table className="codexRateLimitTable">
							<thead>
								<tr>
									<th scope="col" className="codexRateLimitWindowHeader">
										<span className="sr-only">Window</span>
									</th>
									<th scope="col">Remaining</th>
									<th scope="col">Resets in</th>
								</tr>
							</thead>
							<tbody>
								{codexState.rateLimits.map((item) => {
									const remainingPercent = clampPercent(100 - item.usedPercent);
									const tone = toneForRateLimitUsed(item.usedPercent);
									const activeSegments = Math.round(
										(remainingPercent / 100) * rateLimitSegmentCount,
									);
									const WindowIcon =
										item.windowMinutes === 10080 ? Calendar03Icon : Time04Icon;
									const shortLabel = formatRateLimitLabel(
										item.label,
										item.windowMinutes,
									);

									return (
										<tr key={item.key} className={`codexRateLimitRow--${tone}`}>
											<td>
												<span className="codexRateLimitWindow">
													<HugeiconsIcon
														icon={WindowIcon}
														size={16}
														strokeWidth={1.6}
														aria-hidden="true"
													/>
													<span>{shortLabel}</span>
												</span>
											</td>
											<td>
												<div className="codexRateLimitRemaining">
													<progress
														className="sr-only"
														value={Math.round(remainingPercent)}
														max={100}
														aria-label={`${item.label} remaining`}
													/>
													<div
														className="codexRateLimitMeter"
														aria-hidden="true"
													>
														{Array.from({
															length: rateLimitSegmentCount,
														}).map((_, index) => (
															<span
																key={`${item.key}-segment-${index.toString()}`}
																className={
																	index < activeSegments
																		? "codexRateLimitSegment codexRateLimitSegment--active"
																		: "codexRateLimitSegment"
																}
															/>
														))}
													</div>
													<span className="codexRateLimitPercent">
														{`${Math.round(remainingPercent)}%`}
													</span>
												</div>
											</td>
											<td>
												<span className="codexRateLimitReset">
													{formatResetCell(item.resetsAt, nowMs)}
												</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</SettingsRow>
			) : null}
			{codexState.error ? (
				<div className="settingsError">{codexState.error}</div>
			) : null}
		</SettingsSection>
	);
}
