import { useCallback, useEffect, useMemo, useState } from "react";
import {
	getDailyNoteTemplate,
	getTemplatesFolder,
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

function toDisplayPath(value: string, folder: string | null): string {
	if (!folder) return value;
	if (value === folder) return "/";
	const prefix = `${folder}/`;
	return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export function TemplateSettingsSections() {
	const [templatesFolder, setTemplatesFolderState] = useState<string | null>(
		null,
	);
	const [dailyNoteTemplatePath, setDailyNoteTemplatePathState] = useState<
		string | null
	>(null);
	const [templates, setTemplates] = useState<TemplateOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [templatesLoading, setTemplatesLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [templatesError, setTemplatesError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [folder, dailyTemplate] = await Promise.all([
					getTemplatesFolder(),
					getDailyNoteTemplate(),
				]);
				if (cancelled) return;
				setTemplatesFolderState(folder);
				setDailyNoteTemplatePathState(dailyTemplate);
			} catch (cause) {
				if (!cancelled) {
					setError(
						cause instanceof Error
							? cause.message
							: "Failed to load templates settings",
					);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (templatesFolder === null) {
			setTemplates([]);
			setTemplatesLoading(false);
			setTemplatesError(null);
			return;
		}
		let cancelled = false;
		setTemplatesLoading(true);
		void listTemplates(templatesFolder)
			.then((entries) => {
				if (cancelled) return;
				setTemplates(
					entries.map((entry) => ({
						value: entry.relPath,
						label: toDisplayPath(entry.relPath, templatesFolder),
					})),
				);
				setTemplatesError(null);
			})
			.catch((cause) => {
				if (cancelled) return;
				setTemplates([]);
				setTemplatesError(
					cause instanceof Error ? cause.message : "Failed to load templates",
				);
			})
			.finally(() => {
				if (!cancelled) {
					setTemplatesLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [templatesFolder]);

	useEffect(() => {
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
				if (cancelled) return;
				setDailyNoteTemplatePathState(null);
			} catch (cause) {
				if (cancelled) return;
				setError(
					cause instanceof Error
						? cause.message
						: "Failed to clear daily note template",
				);
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
		setError(null);
		try {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selected = await open({
				directory: true,
				multiple: false,
			});
			if (!selected || typeof selected !== "string") return;
			const currentSpacePath = await invoke("space_get_current");
			if (!currentSpacePath) {
				setError("No space is currently open.");
				return;
			}
			const normSelected = selected.replace(/\\/g, "/");
			const normSpace = currentSpacePath.replace(/\\/g, "/");
			const spacePrefix = normSpace.endsWith("/") ? normSpace : `${normSpace}/`;
			if (normSelected !== normSpace && !normSelected.startsWith(spacePrefix)) {
				setError("Selected folder must be inside the current space.");
				return;
			}
			const relativePath = normSelected
				.slice(normSpace.length)
				.replace(/^\/+/, "");
			await setTemplatesFolder(relativePath);
			await setDailyNoteTemplate(null);
			setTemplatesFolderState(relativePath);
			setDailyNoteTemplatePathState(null);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Failed to select template folder",
			);
		}
	}, []);

	const handleClearFolder = useCallback(async () => {
		setError(null);
		try {
			await setTemplatesFolder(null);
			setTemplatesFolderState(null);
			setDailyNoteTemplatePathState(null);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Failed to clear template folder",
			);
		}
	}, []);

	const handleDailyTemplateChange = useCallback(async (value: string) => {
		const next = value.trim() ? value : null;
		setError(null);
		try {
			await setDailyNoteTemplate(next);
			setDailyNoteTemplatePathState(next);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Failed to update daily note template",
			);
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
