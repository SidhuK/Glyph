import { Audit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace, useUILayoutContext } from "../../../contexts";
import {
	getDailyNoteContent,
	getDailyNoteDateFromPath,
	getDailyNotePath,
	getNextDateString,
	getTodayDateString,
	parseIsoDate,
} from "../../../lib/dailyNotes";
import { isMissingFileError } from "../../../lib/fsErrors";
import { type RolloverCandidate, invoke } from "../../../lib/tauri";
import { renderTemplate } from "../../../lib/templates";
import { toast } from "../../../lib/toast";
import { Button } from "../../ui/shadcn/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../../ui/shadcn/popover";
import type { RolloverMoveTarget, RolloverTaskActions } from "../types";

interface DailyNoteRolloverProps {
	children: (actions: RolloverTaskActions | null) => ReactNode;
	mode: "rich" | "preview" | "plain";
	onBeforeReview: () => Promise<boolean>;
	relPath: string;
}

export function DailyNoteRollover({
	children,
	mode,
	onBeforeReview,
	relPath,
}: DailyNoteRolloverProps) {
	const { t } = useTranslation("editor");
	const [summaryOpen, setSummaryOpen] = useState(false);
	const { spacePath } = useSpace();
	const { dailyNotesFolder, dailyNoteTemplatePath } = useUILayoutContext();
	const today = getTodayDateString();
	const noteDate = dailyNotesFolder
		? getDailyNoteDateFromPath(relPath, dailyNotesFolder)
		: null;
	const enabled =
		mode === "rich" &&
		Boolean(dailyNotesFolder && noteDate && noteDate <= today);
	const overdueQuery = useQuery({
		queryKey: ["daily-note-rollover", dailyNotesFolder, today],
		queryFn: () =>
			invoke("daily_note_rollover_candidates", {
				folder: dailyNotesFolder ?? "",
				before_date: today,
			}),
		enabled: enabled && noteDate === today,
	});
	const noteQuery = useQuery({
		queryKey: ["daily-note-rollover-note", dailyNotesFolder, noteDate],
		queryFn: () =>
			invoke("daily_note_rollover_candidates", {
				folder: dailyNotesFolder ?? "",
				before_date: today,
				source_date: noteDate,
			}),
		enabled,
	});

	const moveMutation = useMutation({
		mutationFn: async ({
			target,
			candidates,
		}: {
			target: RolloverMoveTarget;
			candidates: RolloverCandidate[];
		}) => {
			if (!dailyNotesFolder || !noteDate) {
				throw new Error(t("rollover.invalidDailyNote"));
			}
			const destinationDate =
				target === "today" ? today : getNextDateString(today);
			if (!destinationDate) {
				throw new Error(t("rollover.invalidDailyNote"));
			}
			const destinationPath = getDailyNotePath(
				dailyNotesFolder,
				destinationDate,
			);
			let initialText = getDailyNoteContent(destinationDate);
			if (dailyNoteTemplatePath) {
				try {
					const template = await invoke("space_read_text", {
						path: dailyNoteTemplatePath,
					});
					initialText = renderTemplate(template.text, {
						destinationPath,
						spaceRootPath: spacePath,
						date: parseIsoDate(destinationDate) ?? undefined,
					});
				} catch (error) {
					if (!isMissingFileError(error)) throw error;
				}
			}
			return invoke("daily_note_rollover_move", {
				folder: dailyNotesFolder,
				destination_path: destinationPath,
				destination_date: destinationDate,
				destination_initial_text: initialText,
				items: candidates.map((candidate) => ({
					id: candidate.id,
					source_path: candidate.source_path,
					start: candidate.start,
					end: candidate.end,
					source_mtime_ms: candidate.source_mtime_ms,
				})),
			});
		},
		onSuccess: (result) => {
			void overdueQuery.refetch();
			void noteQuery.refetch();
			toast.success(t("rollover.moved", { count: result.moved_count }));
		},
		onError: async () => {
			const { message } = await import("@tauri-apps/plugin-dialog");
			await message(t("rollover.moveFailedDescription"), {
				title: t("rollover.moveFailed"),
				kind: "error",
			});
		},
	});

	const showMoveError = async (description: string) => {
		const { message } = await import("@tauri-apps/plugin-dialog");
		await message(description, {
			title: t("rollover.moveFailed"),
			kind: "error",
		});
	};

	const openReview = async () => {
		if (!(await onBeforeReview())) {
			await showMoveError(t("rollover.saveBeforeMove"));
			return;
		}
		const result = await overdueQuery.refetch();
		if (result.error) {
			await showMoveError(t("rollover.moveFailedDescription"));
			return;
		}
		const candidates = result.data ?? [];
		if (candidates.length === 0) return;

		const { message } = await import("@tauri-apps/plugin-dialog");
		const groups = new Map<string, RolloverCandidate[]>();
		for (const candidate of candidates) {
			const group = groups.get(candidate.original_date) ?? [];
			group.push(candidate);
			groups.set(candidate.original_date, group);
		}
		const selected: RolloverCandidate[] = [];
		for (const [date, group] of groups) {
			const selectAllLabel = t("rollover.selectAll");
			const reviewLabel = t("rollover.reviewIndividually");
			const groupChoice = await message(
				t("rollover.reviewGroupDescription", { count: group.length }),
				{
					title: t("rollover.reviewGroupTitle", { date }),
					buttons: {
						yes: selectAllLabel,
						no: reviewLabel,
						cancel: t("rollover.skip"),
					},
				},
			);
			if (groupChoice === selectAllLabel || groupChoice === "Yes") {
				selected.push(...group);
				continue;
			}
			if (groupChoice !== reviewLabel && groupChoice !== "No") continue;

			for (const candidate of group) {
				const detail = candidate.nested_count
					? `\n\n${t("rollover.nestedSummary", {
							count: candidate.nested_count,
							unfinished: candidate.unfinished_nested_count,
						})}`
					: "";
				const selectLabel = t("rollover.select");
				const cancelReviewLabel = t("rollover.cancelReview");
				const itemChoice = await message(`${candidate.text}${detail}`, {
					title: t("rollover.reviewItemTitle", { date }),
					buttons: {
						yes: selectLabel,
						no: t("rollover.skip"),
						cancel: cancelReviewLabel,
					},
				});
				if (itemChoice === cancelReviewLabel || itemChoice === "Cancel") return;
				if (itemChoice === selectLabel || itemChoice === "Yes") {
					selected.push(candidate);
				}
			}
		}
		if (selected.length === 0) return;

		const moveTodayLabel = t("rollover.moveToday");
		const moveTomorrowLabel = t("rollover.moveTomorrow");
		const cancelLabel = t("rollover.cancel");
		const destination = await message(
			t("rollover.chooseDestinationDescription", { count: selected.length }),
			{
				title: t("rollover.chooseDestination"),
				buttons: {
					yes: moveTodayLabel,
					no: moveTomorrowLabel,
					cancel: cancelLabel,
				},
			},
		);
		if (destination === cancelLabel || destination === "Cancel") return;
		const target =
			destination === moveTodayLabel || destination === "Yes"
				? "today"
				: destination === moveTomorrowLabel || destination === "No"
					? "tomorrow"
					: null;
		if (!target) return;
		moveMutation.mutate({
			target,
			candidates: selected,
		});
	};

	if (!enabled) return children(null);
	const overdue = overdueQuery.data ?? [];
	const taskActions: RolloverTaskActions = {
		targets: noteDate === today ? ["tomorrow"] : ["today", "tomorrow"],
		onMoveCandidate: (index, target) => {
			const candidateId = noteQuery.data?.[index]?.id;
			void (async () => {
				if (!candidateId) {
					await showMoveError(t("rollover.itemChanged"));
					return;
				}
				if (!(await onBeforeReview())) {
					await showMoveError(t("rollover.saveBeforeMove"));
					return;
				}
				const refreshed = await noteQuery.refetch();
				const candidate = refreshed.data?.find(
					(item) => item.id === candidateId,
				);
				if (!candidate) {
					await showMoveError(t("rollover.itemChanged"));
					return;
				}
				moveMutation.mutate({ target, candidates: [candidate] });
			})();
		},
	};

	return (
		<>
			{noteDate === today && overdue.length > 0 ? (
				<Popover open={summaryOpen} onOpenChange={setSummaryOpen}>
					<div className="rolloverReviewTrigger">
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label={t("rollover.bannerLabel")}
							>
								<HugeiconsIcon icon={Audit02Icon} />
							</Button>
						</PopoverTrigger>
					</div>
					<PopoverContent
						align="end"
						sideOffset={6}
						className="w-56"
						style={{
							padding: "var(--space-5) var(--space-3) var(--space-4)",
						}}
					>
						<div className="flex flex-col items-center gap-3 text-center">
							<strong className="text-sm leading-tight tabular-nums">
								{t("rollover.bannerTitle", { count: overdue.length })}
							</strong>
							<Button
								variant="secondary"
								size="xs"
								disabled={moveMutation.isPending}
								onClick={() => {
									setSummaryOpen(false);
									void openReview();
								}}
							>
								<HugeiconsIcon icon={Audit02Icon} />
								{t("rollover.review")}
							</Button>
						</div>
					</PopoverContent>
				</Popover>
			) : null}
			{children(taskActions)}
		</>
	);
}
