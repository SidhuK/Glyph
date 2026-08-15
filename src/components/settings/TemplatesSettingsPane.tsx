import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../contexts";
import {
	EMPTY_PERIOD_NOTE_TEMPLATES,
	PERIOD_KINDS,
	type PeriodKind,
	type PeriodNoteTemplatePaths,
	isPeriodNoteEnabled,
	periodNoteTemplatesFromSettings,
} from "../../lib/periodNotes";
import {
	loadSettings,
	setTemplatesFolder,
	writeSpaceSetting,
} from "../../lib/settings";
import {
	SPACE_SETTINGS,
	type SpaceSettingDefinition,
} from "../../lib/settings/definitions";
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
	periodTemplates: PeriodNoteTemplatePaths;
	error: string | null;
}

interface TemplateLibraryState {
	templates: TemplateOption[];
	error: string | null;
}

const INITIAL_TEMPLATES_SETTINGS_STATE: TemplatesSettingsState = {
	currentSpacePath: null,
	templatesFolder: null,
	periodTemplates: EMPTY_PERIOD_NOTE_TEMPLATES,
	error: null,
};

const INITIAL_TEMPLATE_LIBRARY_STATE: TemplateLibraryState = {
	templates: [],
	error: null,
};

const PERIOD_TEMPLATE_SETTINGS: readonly {
	kind: PeriodKind;
	setting: SpaceSettingDefinition<string | null>;
	labelKey: string;
}[] = [
	{
		kind: "day",
		setting: SPACE_SETTINGS.templatesDailyNoteTemplate,
		labelKey: "periodNoteTemplates.day",
	},
	{
		kind: "week",
		setting: SPACE_SETTINGS.templatesWeeklyNoteTemplate,
		labelKey: "periodNoteTemplates.week",
	},
	{
		kind: "month",
		setting: SPACE_SETTINGS.templatesMonthlyNoteTemplate,
		labelKey: "periodNoteTemplates.month",
	},
	{
		kind: "quarter",
		setting: SPACE_SETTINGS.templatesQuarterlyNoteTemplate,
		labelKey: "periodNoteTemplates.quarter",
	},
];

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
	const { t } = useTranslation("settings.general");
	const { periodNotesEnabled } = useUILayoutContext();
	const [settingsState, setSettingsState] = useState<TemplatesSettingsState>(
		INITIAL_TEMPLATES_SETTINGS_STATE,
	);
	const [templateLibraryState, setTemplateLibraryState] =
		useState<TemplateLibraryState>(INITIAL_TEMPLATE_LIBRARY_STATE);
	const latestTemplateWriteIdRef = useRef<Record<PeriodKind, number>>({
		day: 0,
		week: 0,
		month: 0,
		quarter: 0,
	});
	const latestFolderWriteIdRef = useRef(0);
	const { currentSpacePath, templatesFolder, periodTemplates, error } =
		settingsState;
	const { templates, error: templatesError } = templateLibraryState;

	const beginTemplateWrite = useCallback((kind: PeriodKind) => {
		latestTemplateWriteIdRef.current[kind] += 1;
		return latestTemplateWriteIdRef.current[kind];
	}, []);

	const beginFolderWrite = useCallback(() => {
		latestFolderWriteIdRef.current += 1;
		for (const kind of PERIOD_KINDS) {
			latestTemplateWriteIdRef.current[kind] += 1;
		}
		return latestFolderWriteIdRef.current;
	}, []);

	const clearMissingPeriodTemplates = useCallback(
		async (
			spacePath: string | null,
			nextTemplates: TemplateOption[],
			current: PeriodNoteTemplatePaths,
		): Promise<Partial<Record<PeriodKind, null>>> => {
			const available = new Set(
				nextTemplates.map((template) => template.value),
			);
			const cleared: Partial<Record<PeriodKind, null>> = {};
			for (const { kind, setting } of PERIOD_TEMPLATE_SETTINGS) {
				const selected = current[kind];
				if (!selected || available.has(selected)) continue;
				const writeId = beginTemplateWrite(kind);
				await writeSpaceSetting(setting, null, { spacePath });
				if (writeId !== latestTemplateWriteIdRef.current[kind]) {
					return cleared;
				}
				cleared[kind] = null;
			}
			return cleared;
		},
		[beginTemplateWrite],
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const currentSpace = await ensureCurrentSpaceOpen();
				const settings = await loadSettings({ spacePath: currentSpace });
				if (cancelled) return;
				setSettingsState({
					currentSpacePath: currentSpace,
					templatesFolder: settings.templates.folder,
					periodTemplates: periodNoteTemplatesFromSettings(settings.templates),
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
			const hasSelected = PERIOD_TEMPLATE_SETTINGS.some(
				({ kind }) => periodTemplates[kind] !== null,
			);
			if (hasSelected) {
				const writeId = beginFolderWrite();
				setSettingsState((current) => ({
					...current,
					periodTemplates: EMPTY_PERIOD_NOTE_TEMPLATES,
				}));
				void (async () => {
					try {
						for (const { setting } of PERIOD_TEMPLATE_SETTINGS) {
							await writeSpaceSetting(setting, null, {
								spacePath: currentSpacePath,
							});
						}
					} catch (cause) {
						if (writeId !== latestFolderWriteIdRef.current) return;
						setSettingsState((current) => ({
							...current,
							error:
								cause instanceof Error
									? cause.message
									: "Failed to clear period note templates",
						}));
					}
				})();
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
			.then(async (entries) => {
				if (cancelled) return;
				const nextTemplates = entries.map((entry) => ({
					value: entry.relPath,
					label: toDisplayPath(entry.relPath, templatesFolder),
				}));
				setTemplateLibraryState({
					templates: nextTemplates,
					error: null,
				});
				const clearedPeriodTemplates = await clearMissingPeriodTemplates(
					currentSpacePath,
					nextTemplates,
					periodTemplates,
				);
				if (cancelled) return;
				if (Object.keys(clearedPeriodTemplates).length === 0) return;
				setSettingsState((current) => ({
					...current,
					periodTemplates: {
						...current.periodTemplates,
						...clearedPeriodTemplates,
					},
				}));
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
		beginFolderWrite,
		clearMissingPeriodTemplates,
		currentSpacePath,
		periodTemplates,
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
			writeId = beginFolderWrite();
			for (const { setting } of PERIOD_TEMPLATE_SETTINGS) {
				await writeSpaceSetting(setting, null, {
					spacePath: selection.spacePath,
				});
			}
			if (writeId !== latestFolderWriteIdRef.current) return;
			setSettingsState((current) => ({
				...current,
				currentSpacePath: selection.spacePath,
				templatesFolder: selection.relativePath,
				periodTemplates: EMPTY_PERIOD_NOTE_TEMPLATES,
			}));
		} catch (cause) {
			if (writeId !== null && writeId !== latestFolderWriteIdRef.current) {
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
	}, [beginFolderWrite]);

	const handleClearFolder = useCallback(async () => {
		setSettingsState((current) => ({ ...current, error: null }));
		try {
			const spacePath = requireSpacePath(currentSpacePath);
			await setTemplatesFolder(null, { spacePath });
			setSettingsState((current) => ({
				...current,
				templatesFolder: null,
				periodTemplates: EMPTY_PERIOD_NOTE_TEMPLATES,
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

	const handlePeriodTemplateChange = useCallback(
		async (kind: PeriodKind, value: string) => {
			const next = value.trim() ? value : null;
			const writeId = beginTemplateWrite(kind);
			const setting = PERIOD_TEMPLATE_SETTINGS.find(
				(row) => row.kind === kind,
			)?.setting;
			if (!setting) return;
			setSettingsState((current) => ({ ...current, error: null }));
			try {
				const spacePath = requireSpacePath(currentSpacePath);
				await writeSpaceSetting(setting, next, { spacePath });
				if (writeId !== latestTemplateWriteIdRef.current[kind]) return;
				setSettingsState((current) => ({
					...current,
					periodTemplates: { ...current.periodTemplates, [kind]: next },
				}));
			} catch (cause) {
				if (writeId !== latestTemplateWriteIdRef.current[kind]) return;
				setSettingsState((current) => ({
					...current,
					error:
						cause instanceof Error
							? cause.message
							: "Failed to update period note template",
				}));
			}
		},
		[beginTemplateWrite, currentSpacePath],
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

				{PERIOD_TEMPLATE_SETTINGS.filter((row) =>
					isPeriodNoteEnabled(row.kind, periodNotesEnabled),
				).map((row) => (
					<SettingsRow key={row.kind} label={t(row.labelKey)}>
						<SettingsSelect
							value={periodTemplates[row.kind] ?? ""}
							onChange={(event) =>
								void handlePeriodTemplateChange(row.kind, event.target.value)
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
				))}
			</SettingsSection>
		</>
	);
}
