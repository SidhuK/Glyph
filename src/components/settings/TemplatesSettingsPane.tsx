import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	getDailyNoteTemplate,
	getTemplatesFolder,
	loadSettings,
	setDailyNoteTemplate,
	setTemplatesFolder,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { listTemplates } from "../../lib/templates";
import { Trash2 } from "../Icons";
import { FolderOpen } from "../Icons/NavigationIcons";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

interface TemplateOption {
	label: string;
	value: string;
}

interface TemplatesSettingsState {
	templatesFolder: string | null;
	dailyNoteTemplatePath: string | null;
	loading: boolean;
	error: string | null;
}

interface TemplateLibraryState {
	templates: TemplateOption[];
	loading: boolean;
	error: string | null;
}

const INITIAL_TEMPLATES_SETTINGS_STATE: TemplatesSettingsState = {
	templatesFolder: null,
	dailyNoteTemplatePath: null,
	loading: true,
	error: null,
};

const INITIAL_TEMPLATE_LIBRARY_STATE: TemplateLibraryState = {
	templates: [],
	loading: false,
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
	const settings = await loadSettings();
	if (!settings.currentSpacePath) return null;
	const opened = await invoke("space_open", {
		path: settings.currentSpacePath,
	});
	return opened.root;
}

export function TemplateSettingsSections() {
	const [settingsState, setSettingsState] = useState<TemplatesSettingsState>(
		INITIAL_TEMPLATES_SETTINGS_STATE,
	);
	const [templateLibraryState, setTemplateLibraryState] =
		useState<TemplateLibraryState>(INITIAL_TEMPLATE_LIBRARY_STATE);
	const { templatesFolder, dailyNoteTemplatePath, loading, error } =
		settingsState;
	const {
		templates,
		loading: templatesLoading,
		error: templatesError,
	} = templateLibraryState;
	const latestClearOpIdRef = useRef(0);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [folder, dailyTemplate] = await Promise.all([
					getTemplatesFolder(),
					getDailyNoteTemplate(),
				]);
				if (cancelled) return;
				setSettingsState({
					templatesFolder: folder,
					dailyNoteTemplatePath: dailyTemplate,
					loading: false,
					error: null,
				});
			} catch (cause) {
				if (cancelled) return;
				setSettingsState((current) => ({
					...current,
					loading: false,
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
			return;
		}
		let cancelled = false;
		setTemplateLibraryState((current) => ({
			...current,
			loading: true,
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
				setTemplateLibraryState({
					templates: entries.map((entry) => ({
						value: entry.relPath,
						label: toDisplayPath(entry.relPath, templatesFolder),
					})),
					loading: false,
					error: null,
				});
			})
			.catch((cause) => {
				if (cancelled) return;
				setTemplateLibraryState({
					templates: [],
					loading: false,
					error:
						cause instanceof Error ? cause.message : "Failed to load templates",
				});
			});
		return () => {
			cancelled = true;
		};
	}, [templatesFolder]);

	useEffect(() => {
		const opId = ++latestClearOpIdRef.current;
		if (loading || templatesLoading || templatesError) return;
		if (!dailyNoteTemplatePath) return;
		if (
			templates.some((template) => template.value === dailyNoteTemplatePath)
		) {
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				await setDailyNoteTemplate(null);
				if (cancelled || opId !== latestClearOpIdRef.current) return;
				setSettingsState((current) => ({
					...current,
					dailyNoteTemplatePath: null,
				}));
			} catch (cause) {
				if (cancelled || opId !== latestClearOpIdRef.current) return;
				setSettingsState((current) => ({
					...current,
					error:
						cause instanceof Error
							? cause.message
							: "Failed to clear daily note template",
				}));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		dailyNoteTemplatePath,
		loading,
		templates,
		templatesError,
		templatesLoading,
	]);

	const handleBrowseFolder = useCallback(async () => {
		setSettingsState((current) => ({ ...current, error: null }));
		try {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selected = await open({
				directory: true,
				multiple: false,
			});
			if (!selected || typeof selected !== "string") return;
			const currentSpacePath = await ensureCurrentSpaceOpen();
			if (!currentSpacePath) {
				setSettingsState((current) => ({
					...current,
					error: "No space is currently open.",
				}));
				return;
			}
			const normSelected = selected.replace(/\\/g, "/");
			const normSpace = currentSpacePath.replace(/\\/g, "/");
			const spacePrefix = normSpace.endsWith("/") ? normSpace : `${normSpace}/`;
			if (normSelected !== normSpace && !normSelected.startsWith(spacePrefix)) {
				setSettingsState((current) => ({
					...current,
					error: "Selected folder must be inside the current space.",
				}));
				return;
			}
			const relativePath = normSelected
				.slice(normSpace.length)
				.replace(/^\/+/, "");
			await setTemplatesFolder(relativePath);
			await setDailyNoteTemplate(null);
			setSettingsState((current) => ({
				...current,
				templatesFolder: relativePath,
				dailyNoteTemplatePath: null,
			}));
		} catch (cause) {
			setSettingsState((current) => ({
				...current,
				error:
					cause instanceof Error
						? cause.message
						: "Failed to select template folder",
			}));
		}
	}, []);

	const handleClearFolder = useCallback(async () => {
		setSettingsState((current) => ({ ...current, error: null }));
		try {
			await setTemplatesFolder(null);
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
	}, []);

	const handleDailyTemplateChange = useCallback(async (value: string) => {
		const next = value.trim() ? value : null;
		setSettingsState((current) => ({ ...current, error: null }));
		try {
			await setDailyNoteTemplate(next);
			setSettingsState((current) => ({
				...current,
				dailyNoteTemplatePath: next,
			}));
		} catch (cause) {
			setSettingsState((current) => ({
				...current,
				error:
					cause instanceof Error
						? cause.message
						: "Failed to update daily note template",
			}));
		}
	}, []);

	const summary = useMemo(() => {
		if (templatesFolder === null) return "Not configured";
		if (templatesLoading) return "Loading templates...";
		return `${templates.length} template${templates.length === 1 ? "" : "s"} found`;
	}, [templates.length, templatesFolder, templatesLoading]);

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
					<div className="dailyNotesFolderField">
						<div className="dailyNotesFolderRow">
							<div className="dailyNotesFolderPath">
								{loading
									? "Loading..."
									: templatesFolder === null
										? "Not configured"
										: templatesFolder || "/"}
							</div>
							<div className="settingsActions dailyNotesActions">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
									onClick={handleBrowseFolder}
									disabled={loading}
								>
									<FolderOpen size={14} />
									Browse
								</Button>
								{templatesFolder !== null ? (
									<Button
										type="button"
										variant="outline"
										size="icon-sm"
										className="rounded-md border-border bg-background justify-center shadow-none"
										onClick={handleClearFolder}
										disabled={loading}
										aria-label="Clear template folder"
										title="Clear template folder"
									>
										<Trash2 size={14} />
									</Button>
								) : null}
							</div>
						</div>
						<div className="settingsHelp">{summary}</div>
						{templatesError ? (
							<div className="settingsError dailyNotesError">
								{templatesError}
							</div>
						) : null}
					</div>
				</SettingsRow>

				<SettingsRow label="Default daily note template">
					<select
						value={dailyNoteTemplatePath ?? ""}
						onChange={(event) =>
							void handleDailyTemplateChange(event.target.value)
						}
						disabled={
							templatesFolder === null || templatesLoading || !templates.length
						}
					>
						<option value="">None</option>
						{templates.map((template) => (
							<option key={template.value} value={template.value}>
								{template.label}
							</option>
						))}
					</select>
				</SettingsRow>
			</SettingsSection>
		</>
	);
}

export function TemplatesSettingsPane() {
	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				<TemplateSettingsSections />
			</div>
		</div>
	);
}
