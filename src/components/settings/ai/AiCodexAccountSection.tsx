import { Calendar03Icon, Time04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "../SettingsScaffold";
import {
	MINUTES_PER_WEEK,
	clampPercent,
	formatResetDuration,
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
	t: TFunction<"settings">,
): string {
	if (windowMinutes === MINUTES_PER_WEEK) return t("ai.codex.weekly");
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
	return formatResetDuration(timestamp, nowMs);
}

export function AiCodexAccountSection({
	codexState,
	nowMs,
	onConnect,
	onDisconnect,
}: AiCodexAccountSectionProps) {
	const { t } = useTranslation("settings");
	return (
		<SettingsSection
			title={t("ai.codex.title")}
			description={t("ai.codex.description")}
			aside={
				<div
					className={`settingsPill ${toneForCodexStatus(codexState.status)}`}
				>
					{labelForCodexStatus(codexState.status)}
				</div>
			}
		>
			<SettingsRow
				label={t("ai.codex.identity")}
				description={t("ai.codex.identityDescription")}
				interactive={false}
			>
				<div className="settingsInline">
					<div className="settingsHint">
						{codexState.displayName ||
							codexState.email ||
							t("ai.codex.notConnected")}
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
								{t("ai.codex.disconnect")}
							</Button>
						</>
					) : (
						<Button
							type="button"
							size="sm"
							onClick={() => void onConnect()}
							disabled={codexState.loading}
						>
							{t("ai.codex.signIn")}
						</Button>
					)}
				</div>
			</SettingsRow>
			{codexState.authMode ? (
				<SettingsRow
					label={t("ai.codex.authentication")}
					description={t("ai.codex.authenticationDescription")}
					interactive={false}
				>
					<div className="settingsHint">{codexState.authMode}</div>
				</SettingsRow>
			) : null}
			{codexState.rateLimits.length > 0 ? (
				<SettingsRow
					label={t("ai.codex.rateLimits")}
					description={t("ai.codex.rateLimitsDescription")}
					stacked
					interactive={false}
				>
					<div className="codexRateLimitTableWrap">
						<table className="codexRateLimitTable">
							<thead>
								<tr>
									<th scope="col" className="codexRateLimitWindowHeader">
										<span className="sr-only">{t("ai.codex.window")}</span>
									</th>
									<th scope="col">{t("ai.codex.remaining")}</th>
									<th scope="col">{t("ai.codex.resetsIn")}</th>
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
										item.windowMinutes === MINUTES_PER_WEEK
											? Calendar03Icon
											: Time04Icon;
									const shortLabel = formatRateLimitLabel(
										item.label,
										item.windowMinutes,
										t,
									);

									return (
										<tr key={item.key} className={`codexRateLimitRow--${tone}`}>
											<td>
												<span className="codexRateLimitWindow">
													<HugeiconsIcon
														icon={WindowIcon}
														size="var(--icon-lg)"
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
														aria-label={t("ai.codex.remainingPercent", {
															label: item.label,
														})}
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
