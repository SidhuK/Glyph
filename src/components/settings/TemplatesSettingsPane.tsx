import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	getDailyNoteTemplate,
	getTemplatesFolder,
	setDailyNoteTemplate,
	setTemplatesFolder,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { listTemplates } from "../../lib/templates";
import { SettingsFolderPicker } from "./SettingsFolderPicker";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import {
	requireSpacePath,
	selectFolderRelativeToSpace,
} from "./spaceFolderSelection";

interface TemplateOption {
	label: string;
	value: string;
}

interface TemplatesSettingsState {
	currentSpacePath: string | null;
	templatesFolder: string | null;
	dailyNoteTemplatePath: string | null;
	error: string | null;
}

interface TemplateLibraryState {
	templates: TemplateOption[];
	error: string | null;
}

const INITIAL_TEMPLATES_SETTINGS_STATE: TemplatesSettingsState = {
	currentSpacePath: null,
	templatesFolder: null,
	dailyNoteTemplatePath: null,
	error: null,
};

const INITIAL_TEMPLATE_LIBRARY_STATE: TemplateLibraryState = {
	templates: [],
	error: null,
};

function toDisplayPath(value: string, folder: string | null): string {
	if (!folder) return value;
	if (value === folder) return "/";
	const prefix = `${folder}/`;
	return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

async function ensureCurrentSpaceOpen(): Promise<string | null> {
	const currentSpacePath = await invoke("space_get_current");
	if (currentSpacePath) return currentSpacePath;
	return null;
}

export function TemplateSettingsSections() {
	const [settingsState, setSettingsState] = useState<TemplatesSettingsState>(
		INITIAL_TEMPLATES_SETTINGS_STATE,
	);
	const [templateLibraryState, setTemplateLibraryState] =
		useState<TemplateLibraryState>(INITIAL_TEMPLATE_LIBRARY_STATE);
	const latestDailyTemplateWriteIdRef = useRef(0);
	const { currentSpacePath, templatesFolder, dailyNoteTemplatePath, error } =
		settingsState;
	const { templates, error: templatesError } = templateLibraryState;

	const beginDailyTemplateWrite = useCallback(() => {
		latestDailyTemplateWriteIdRef.current += 1;
		return latestDailyTemplateWriteIdRef.current;
	}, []);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const currentSpace = await ensureCurrentSpaceOpen();
				const settingsScope = { spacePath: currentSpace };
				const [folder, dailyTemplate] = await Promise.all([
					getTemplatesFolder(settingsScope),
					getDailyNoteTemplate(settingsScope),
				]);
				if (cancelled) return;
				setSettingsState({
					currentSpacePath: currentSpace,
					templatesFolder: folder,
					dailyNoteTemplatePath: dailyTemplate,
					error: null,
				});
			} catch (cause) {
				if (cancelled) return;
				setSettingsState((current) => ({
					...current,
					error:
						cause instanceof Error
							? cause.message
							: "Failed to load templates settings",
				}));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (templatesFolder === null) {
			setTemplateLibraryState(INITIAL_TEMPLATE_LIBRARY_STATE);
			if (dailyNoteTemplatePath !== null) {
				const writeId = beginDailyTemplateWrite();
				setSettingsState((current) => ({
					...current,
					dailyNoteTemplatePath: null,
				}));
				void setDailyNoteTemplate(null, {
					spacePath: currentSpacePath,
				}).catch((cause) => {
					if (writeId !== latestDailyTemplateWriteIdRef.current) return;
					setSettingsState((current) => ({
						...current,
						error:
							cause instanceof Error
								? cause.message
								: "Failed to clear daily note template",
					}));
				});
			}
			return;
		}
		let cancelled = false;
		setTemplateLibraryState((current) => ({
			...current,
			error: null,
		}));
		void ensureCurrentSpaceOpen()
			.then((spacePath) => {
				if (!spacePath) {
					throw new Error("No space is currently open.");
				}
				return listTemplates(templatesFolder);
			})
			.then((entries) => {
				if (cancelled) return;
				const nextTemplates = entries.map((entry) => ({
					value: entry.relPath,
					label: toDisplayPath(entry.relPath, templatesFolder),
				}));
				setTemplateLibraryState({
					templates: nextTemplates,
					error: null,
				});
				if (
					dailyNoteTemplatePath &&
					!nextTemplates.some(
						(template) => template.value === dailyNoteTemplatePath,
					)
				) {
					const writeId = beginDailyTemplateWrite();
					void setDailyNoteTemplate(null, {
						spacePath: currentSpacePath,
					})
						.then(() => {
							if (
								cancelled ||
								writeId !== latestDailyTemplateWriteIdRef.current
							) {
								return;
							}
							setSettingsState((current) => ({
								...current,
								dailyNoteTemplatePath: null,
							}));
						})
						.catch((cause) => {
							if (
								cancelled ||
								writeId !== latestDailyTemplateWriteIdRef.current
							) {
								return;
							}
							setSettingsState((current) => ({
								...current,
								error:
									cause instanceof Error
										? cause.message
										: "Failed to clear daily note template",
							}));
						});
				}
			})
			.catch((cause) => {
				if (cancelled) return;
				setTemplateLibraryState({
					templates: [],
					error:
						cause instanceof Error ? cause.message : "Failed to load templates",
				});
			});
		return () => {
			cancelled = true;
		};
	}, [
		beginDailyTemplateWrite,
		currentSpacePath,
		dailyNoteTemplatePath,
		templatesFolder,
	]);

	const handleBrowseFolder = useCallback(async () => {
		let writeId: number | null = null;
		setSettingsState((current) => ({ ...current, error: null }));
		try {
			const selection = await selectFolderRelativeToSpace();
			if (!selection) return;
			await setTemplatesFolder(selection.relativePath, {
				spacePath: selection.spacePath,
			});
			writeId = beginDailyTemplateWrite();
			await setDailyNoteTemplate(null, { spacePath: selection.spacePath });
			if (writeId !== latestDailyTemplateWriteIdRef.current) return;
			setSettingsState((current) => ({
				...current,
				currentSpacePath: selection.spacePath,
				templatesFolder: selection.relativePath,
				dailyNoteTemplatePath: null,
			}));
		} catch (cause) {
			if (
				writeId !== null &&
				writeId !== latestDailyTemplateWriteIdRef.current
			) {
				return;
			}
			setSettingsState((current) => ({
				...current,
				error:
					cause instanceof Error
						? cause.message
						: "Failed to select template folder",
			}));
		}
	}, [beginDailyTemplateWrite]);

	const handleClearFolder = useCallback(async () => {
		setSettingsState((current) => ({ ...current, error: null }));
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await setTemplatesFolder(null, { spacePath });
			setSettingsState((current) => ({
				...current,
				templatesFolder: null,
				dailyNoteTemplatePath: null,
			}));
		} catch (cause) {
			setSettingsState((current) => ({
				...current,
				error:
					cause instanceof Error
						? cause.message
						: "Failed to clear template folder",
			}));
		}
	}, [currentSpacePath]);

	const handleDailyTemplateChange = useCallback(
		async (value: string) => {
			const next = value.trim() ? value : null;
			const writeId = beginDailyTemplateWrite();
			setSettingsState((current) => ({ ...current, error: null }));
			try {
				const spacePath = requireSpacePath(currentSpacePath);
				await setDailyNoteTemplate(next, { spacePath });
				if (writeId !== latestDailyTemplateWriteIdRef.current) return;
				setSettingsState((current) => ({
					...current,
					dailyNoteTemplatePath: next,
				}));
			} catch (cause) {
				if (writeId !== latestDailyTemplateWriteIdRef.current) return;
				setSettingsState((current) => ({
					...current,
					error:
						cause instanceof Error
							? cause.message
							: "Failed to update daily note template",
				}));
			}
		},
		[beginDailyTemplateWrite, currentSpacePath],
	);

	const summary = useMemo(() => {
		if (templatesFolder === null) return "Not configured";
		return `${templates.length} template${templates.length === 1 ? "" : "s"} found`;
	}, [templates.length, templatesFolder]);

	return (
		<>
			{error ? <div className="settingsError">{error}</div> : null}

			<SettingsSection title="Templates">
				<SettingsRow
					label="Template folder"
					description="Choose a folder inside the current space that contains your markdown templates."
					stacked
					interactive={false}
				>
					<SettingsFolderPicker
						path={
							templatesFolder === null
								? "Not configured"
								: templatesFolder || "/"
						}
						browseLabel="Browse"
						clearLabel="Clear template folder"
						onBrowse={() => void handleBrowseFolder()}
						onClear={
							templatesFolder !== null
								? () => void handleClearFolder()
								: undefined
						}
						helper={summary}
						error={templatesError}
					/>
				</SettingsRow>

				<SettingsRow label="Default daily note template">
					<SettingsSelect
						value={dailyNoteTemplatePath ?? ""}
						onChange={(event) =>
							void handleDailyTemplateChange(event.target.value)
						}
						disabled={templatesFolder === null || !templates.length}
					>
						<option value="">None</option>
						{templates.map((template) => (
							<option key={template.value} value={template.value}>
								{template.label}
							</option>
						))}
					</SettingsSelect>
				</SettingsRow>
			</SettingsSection>
		</>
	);
}
