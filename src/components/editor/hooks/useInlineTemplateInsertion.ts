import { useCallback, useRef } from "react";
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
	const noteKey = `${spacePath ?? ""}\0${relPath}`;
	const noteKeyRef = useRef(noteKey);
	noteKeyRef.current = noteKey;
	const configRef = useRef({
		noteKey,
		openSettings,
		relPath,
		settingsSpacePath,
		spacePath,
		t,
		templateFolder,
	});
	configRef.current = {
		noteKey,
		openSettings,
		relPath,
		settingsSpacePath,
		spacePath,
		t,
		templateFolder,
	};

	const requestTemplate = useCallback((request: TemplateInsertRequest) => {
		const config = configRef.current;
		if (config.settingsSpacePath !== config.spacePath) {
			request.cancel();
			toast.error(config.t("slash.insertTemplate.settingsLoading"));
			return;
		}
		if (!config.spacePath || config.templateFolder === null) {
			request.cancel();
			toast.error(config.t("slash.insertTemplate.folderRequired"));
			config.openSettings("space");
			return;
		}
		const requestNoteKey = config.noteKey;
		void selectTemplateFile({
			spaceRootPath: config.spacePath,
			templateFolder: config.templateFolder,
			title: config.t("slash.insertTemplate.title"),
		})
			.then((selection) => {
				if (requestNoteKey !== noteKeyRef.current) return;
				if (selection.kind === "cancelled") {
					request.cancel();
					return;
				}
				if (selection.kind === "invalid") {
					request.cancel();
					toast.error(config.t("slash.insertTemplate.selectionInvalid"));
					return;
				}
				return invoke("space_read_text", {
					path: selection.template.relPath,
				}).then((templateDoc) => {
					if (requestNoteKey !== noteKeyRef.current) return;
					const inserted = request.insert(
						renderTemplate(templateDoc.text, {
							destinationPath: config.relPath,
							spaceRootPath: config.spacePath,
						}),
					);
					if (!inserted) {
						toast.error(config.t("slash.insertTemplate.insertFailed"));
					}
				});
			})
			.catch((cause: unknown) => {
				if (requestNoteKey !== noteKeyRef.current) return;
				request.cancel();
				toast.error(config.t("slash.insertTemplate.loadFailed"), {
					description: cause instanceof Error ? cause.message : String(cause),
				});
			});
	}, []);

	return requestTemplate;
}
