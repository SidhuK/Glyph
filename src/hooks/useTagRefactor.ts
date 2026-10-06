import { useIsMutating, useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { type MouseEvent, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { normalizeTagToken } from "../components/editor/noteProperties/utils";
import { useEditorContext, useFileTreeContext, useSpace } from "../contexts";
import { extractErrorMessage } from "../lib/errorUtils";
import { showNativeContextMenu } from "../lib/nativeContextMenu";
import { type TagRefactorFailure, type TagRefactorPlan, invoke } from "../lib/tauri";
import { toast } from "../lib/toast";

export const TAG_REFACTOR_ACTIONS = ["rename", "merge", "delete"] as const;
export type TagRefactorAction = (typeof TAG_REFACTOR_ACTIONS)[number];

const TAG_REFACTOR_MUTATION_KEY = ["tag-refactor"];
const MAX_LISTED_ITEMS = 5;

interface ApplyVariables {
	from: string;
	to: string | null;
	plan: TagRefactorPlan;
	expectedSpace: string;
}

function listItems(items: readonly string[]): string {
	const listed = items.slice(0, MAX_LISTED_ITEMS).join("\n");
	return items.length > MAX_LISTED_ITEMS ? `${listed}\n…` : listed;
}

function listFailures(t: TFunction<"shell">, failures: readonly TagRefactorFailure[]): string {
	return listItems(
		failures.map(({ path, reason, detail }) => {
			const text = t(`tags.refactor.reasons.${reason}`);
			return `${path}: ${detail ? `${text} (${detail})` : text}`;
		}),
	);
}

function describePlan(t: TFunction<"shell">, action: TagRefactorAction, plan: TagRefactorPlan) {
	const count = (key: "inline_count" | "frontmatter_count") =>
		plan.notes.reduce((sum, note) => sum + note[key], 0);
	const lines = [
		t("tags.refactor.scope", {
			count: plan.notes.length,
			inline: count("inline_count"),
			frontmatter: count("frontmatter_count"),
		}),
	];
	const tagList = (tags: readonly string[]) => listItems(tags.map((tag) => `#${tag}`));
	if (plan.descendant_tags.length) {
		lines.push(
			`${t("tags.refactor.descendants", { count: plan.descendant_tags.length })}\n${tagList(plan.descendant_tags)}`,
		);
	}
	if (action === "rename" && plan.conflicts.length) {
		lines.push(
			`${t("tags.refactor.mergeNotice", { count: plan.conflicts.length })}\n${tagList(plan.conflicts)}`,
		);
	}
	if (action === "delete") lines.push(t("tags.refactor.deleteNotice"));
	if (plan.failures.length) {
		lines.push(
			`${t("tags.refactor.skippedNotice", { count: plan.failures.length })}\n${listFailures(t, plan.failures)}`,
		);
	}
	return lines.join("\n\n");
}

/** Rename, merge, or delete a tag across every note, after a native preview of the affected notes. */
export function useTagRefactor() {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { tags, refreshTagAppearance } = useFileTreeContext();
	const { saveAllEditors, prepareEditorsForExternalMutation } = useEditorContext();
	const isPending = useIsMutating({ mutationKey: TAG_REFACTOR_MUTATION_KEY }) > 0;

	const { mutate: apply } = useMutation({
		mutationKey: TAG_REFACTOR_MUTATION_KEY,
		mutationFn: async ({ from, to, plan, expectedSpace }: ApplyVariables) => {
			// Edits typed while the preview was open must land first; the backend then
			// reports those notes as changed since the preview instead of overwriting them.
			if (!(await prepareEditorsForExternalMutation(plan.notes.map((note) => note.path)))) {
				throw new Error(t("noteCollections.unsaved"));
			}
			return invoke("tag_refactor_apply", {
				from,
				to,
				notes: plan.notes.map(({ path, mtime_ms }) => ({ path, mtime_ms })),
				expected_space: expectedSpace,
			});
		},
		onSuccess: async (result) => {
			await refreshTagAppearance();
			if (result.icon_error) {
				toast.warning(t("tags.refactor.iconFailed"), { description: result.icon_error });
			}
			const changed = result.changed_paths.length;
			if (result.failures.length) {
				toast.error(
					t("tags.refactor.partial", { changed, total: changed + result.failures.length }),
					{ description: listFailures(t, result.failures) },
				);
				return;
			}
			toast.success(t("tags.refactor.done", { count: changed }));
		},
		onError: (error) =>
			toast.error(t("tags.refactor.failed"), { description: extractErrorMessage(error) }),
	});

	const run = useCallback(
		async (action: TagRefactorAction, from: string) => {
			if (!spacePath || isPending) return;
			const targetError = (written: string) => {
				const normalized = normalizeTagToken(written);
				if (
					!normalized ||
					normalized !== written.toLowerCase() ||
					normalized === "people" ||
					normalized.startsWith("people/")
				) {
					return t("tags.refactor.invalid", { name: written });
				}
				if (normalized === from) return t("tags.refactor.same");
				if (normalized.startsWith(`${from}/`)) return t("tags.refactor.inside");
				if (action === "merge" && !tags.some((tag) => tag.tag === normalized)) {
					return t("tags.refactor.mergeMissing", { tag: normalized });
				}
				return null;
			};
			/** Resolves to the target as typed, or `null` when the prompt is cancelled. */
			const promptTarget = async (prompt: "rename" | "merge") => {
				const title = t(`tags.refactor.${prompt}Title`, { tag: from });
				let value = prompt === "rename" ? from : "";
				for (;;) {
					const input = await invoke("native_text_prompt", {
						request: {
							title,
							description: t(`tags.refactor.${prompt}Prompt`, { tag: from }),
							initial_value: value,
							confirm_label: t("tags.refactor.continue"),
							cancel_label: t("tags.refactor.cancel"),
						},
					});
					if (input === null) return null;
					value = input;
					const written = input.trim().replace(/^#+/, "").trim();
					const error = targetError(written);
					if (!error) return written;
					const { message } = await import("@tauri-apps/plugin-dialog");
					await message(error, { title, kind: "warning" });
				}
			};
			try {
				const to = action === "delete" ? null : await promptTarget(action);
				if (action !== "delete" && to === null) return;
				// Saved edits are reindexed, so the preview counts and mtimes match disk.
				await saveAllEditors();
				const plan = await invoke("tag_refactor_plan", { from, to });
				if (!plan.notes.length) {
					if (plan.failures.length) {
						toast.error(t("tags.refactor.blocked", { tag: from }), {
							description: listFailures(t, plan.failures),
						});
					} else {
						toast.info(t("tags.refactor.nothing", { tag: from }));
					}
					return;
				}
				const { confirm } = await import("@tauri-apps/plugin-dialog");
				const confirmed = await confirm(describePlan(t, action, plan), {
					title: t(`tags.refactor.${action}ConfirmTitle`, { from, to }),
					kind: "warning",
					okLabel: t(`tags.refactor.${action}Confirm`),
					cancelLabel: t("tags.refactor.cancel"),
				});
				if (!confirmed) return;
				apply({ from, to, plan, expectedSpace: spacePath });
			} catch (error) {
				toast.error(t("tags.refactor.failed"), { description: extractErrorMessage(error) });
			}
		},
		[apply, isPending, saveAllEditors, spacePath, t, tags],
	);

	const openTagMenu = useCallback(
		(event: MouseEvent<HTMLElement>, tag: string) => {
			void showNativeContextMenu(
				event,
				TAG_REFACTOR_ACTIONS.map((action) => ({
					label: t(`tags.refactor.${action}Menu`),
					enabled: !isPending,
					action: () => void run(action, tag),
				})),
			).catch((error: unknown) => {
				console.error("Failed to show tag context menu", error);
			});
		},
		[isPending, run, t],
	);

	return { run, openTagMenu, isPending };
}
