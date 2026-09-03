import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSpace, useUILayoutContext } from "../../../contexts";
import { invoke } from "../../../lib/tauri";
import { renderTemplate, selectTemplateFile } from "../../../lib/templates";
import { toast } from "../../../lib/toast";
import type { TemplateInsertRequest } from "../slashCommands";

export function useInlineTemplateInsertion(relPath: string) {
	const { t } = useTranslation("editor");
	const { spacePath } = useSpace();
	const { openSettings, settingsSpacePath, templateFolder } =
		useUILayoutContext();
	const requestTemplate = useCallback(
		(request: TemplateInsertRequest) => {
			if (settingsSpacePath !== spacePath) {
				request.cancel();
				toast.error(t("slash.insertTemplate.settingsLoading"));
				return;
			}
			if (!spacePath || templateFolder === null) {
				request.cancel();
				toast.error(t("slash.insertTemplate.folderRequired"));
				openSettings("space");
				return;
			}
			void selectTemplateFile({
				spaceRootPath: spacePath,
				templateFolder,
				title: t("slash.insertTemplate.title"),
			})
				.then((selection) => {
					if (selection.kind === "cancelled") {
						request.cancel();
						return;
					}
					if (selection.kind === "empty") {
						request.cancel();
						toast.error(t("slash.insertTemplate.noTemplates"));
						openSettings("space");
						return;
					}
					if (selection.kind === "invalid") {
						request.cancel();
						toast.error(t("slash.insertTemplate.selectionInvalid"));
						return;
					}
					return invoke("space_read_text", {
						path: selection.template.relPath,
					}).then((templateDoc) => {
						const inserted = request.insert(
							renderTemplate(templateDoc.text, {
								destinationPath: relPath,
								spaceRootPath: spacePath,
							}),
						);
						if (!inserted) {
							toast.error(t("slash.insertTemplate.insertFailed"));
						}
					});
				})
				.catch((cause: unknown) => {
					request.cancel();
					toast.error(t("slash.insertTemplate.loadFailed"), {
						description: cause instanceof Error ? cause.message : String(cause),
					});
				});
		},
		[openSettings, relPath, settingsSpacePath, spacePath, t, templateFolder],
	);

	return requestTemplate;
}
