import { ReloadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShortcutBindings } from "../../hooks/useShortcutBindings";
import {
	type ShortcutBindings,
	findShortcutConflict,
	resetShortcutBinding,
	setShortcutBinding,
} from "../../lib/settings";
import {
	type Shortcut,
	isShortcutModifierKey,
	normalizeShortcut,
	shortcutFromKeyboardEvent,
	validateConfigurableShortcut,
} from "../../lib/shortcuts";
import {
	formatShortcutForPlatform,
	formatShortcutPartsForPlatform,
	isMacOS,
} from "../../lib/shortcuts/platform";
import {
	SHORTCUT_CATEGORIES,
	type ShortcutCategory,
	getShortcutActionDefinition,
} from "../../lib/shortcuts/registry";
import { Trash2 } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

function formatBinding(binding: Shortcut | null) {
	return binding ? formatShortcutForPlatform(binding) : "Disabled";
}

function hasPressedModifier(shortcut: Shortcut | null) {
	return Boolean(
		shortcut?.meta || shortcut?.ctrl || shortcut?.alt || shortcut?.shift,
	);
}

function formatRecordingPrompt(draft: Shortcut | null) {
	if (!draft || !hasPressedModifier(draft)) return "Press shortcut...";
	const parts = formatShortcutPartsForPlatform({
		...draft,
		key: "",
	}).filter(Boolean);
	return `${parts.join(isMacOS() ? "" : "+")}...`;
}

interface ShortcutCaptureEvent {
	key: string;
	code: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	preventDefault: () => void;
	stopPropagation: () => void;
}

export function ShortcutsSettingsPane() {
	const { t } = useTranslation("commands");
	const { actionsWithBindings, bindings } = useShortcutBindings();
	const [filter, setFilter] = useState("");
	const [recordingActionId, setRecordingActionId] = useState<string | null>(
		null,
	);
	const [recordingDraft, setRecordingDraft] = useState<Shortcut | null>(null);
	const [busyActionId, setBusyActionId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const filteredActions = useMemo(() => {
		const query = filter.trim().toLowerCase();
		if (!query) return actionsWithBindings;
		return actionsWithBindings.filter((action) => {
			const binding = formatBinding(action.binding).toLowerCase();
			const label = t(`commands.${action.id}.label`).toLowerCase();
			const description = t(`commands.${action.id}.description`).toLowerCase();
			const category = t(`categories.${action.category}`).toLowerCase();
			return (
				label.includes(query) ||
				description.includes(query) ||
				category.includes(query) ||
				binding.includes(query)
			);
		});
	}, [actionsWithBindings, filter, t]);

	const groupedActions = useMemo(() => {
		const groups = new Map<ShortcutCategory, typeof filteredActions>();
		for (const category of SHORTCUT_CATEGORIES) {
			groups.set(category, []);
		}
		for (const action of filteredActions) {
			groups.get(action.category)?.push(action);
		}
		return Array.from(groups.entries()).filter(
			([, actions]) => actions.length > 0,
		);
	}, [filteredActions]);

	const handleDisable = async (actionId: string) => {
		setBusyActionId(actionId);
		setError("");
		try {
			await setShortcutBinding(actionId, null);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Failed to disable shortcut.",
			);
		} finally {
			setBusyActionId(null);
		}
	};

	const handleReset = async (actionId: string) => {
		setBusyActionId(actionId);
		setError("");
		try {
			await resetShortcutBinding(actionId);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Failed to reset shortcut.",
			);
		} finally {
			setBusyActionId(null);
			setRecordingActionId((current) =>
				current === actionId ? null : current,
			);
		}
	};

	const handleRecordKeyDown = useCallback(
		async (actionId: string, event: ShortcutCaptureEvent) => {
			event.preventDefault();
			event.stopPropagation();
			setError("");
			if (event.key === "Escape") {
				setRecordingActionId(null);
				setRecordingDraft(null);
				return;
			}
			const nextBinding = shortcutFromKeyboardEvent(event);
			if (isShortcutModifierKey(event.key)) {
				setRecordingDraft(nextBinding);
				return;
			}
			const validation = validateConfigurableShortcut(nextBinding);
			if (!validation.valid) {
				setError(validation.reason ?? "Invalid shortcut.");
				return;
			}
			const conflictId = findShortcutConflict(
				nextBinding,
				bindings as ShortcutBindings,
				actionId,
			);
			if (conflictId) {
				const conflict = getShortcutActionDefinition(conflictId);
				setError(
					`${formatShortcutForPlatform(nextBinding)} is already used by ${
						conflict ? t(`commands.${conflictId}.label`) : conflictId
					}.`,
				);
				return;
			}
			setBusyActionId(actionId);
			try {
				await setShortcutBinding(actionId, nextBinding);
				setRecordingActionId(null);
				setRecordingDraft(null);
			} catch (cause) {
				setError(
					cause instanceof Error ? cause.message : "Failed to save shortcut.",
				);
			} finally {
				setBusyActionId(null);
			}
		},
		[bindings, t],
	);

	const handleRecordKeyUp = useCallback(
		(event: ShortcutCaptureEvent) => {
			if (!recordingActionId || !isShortcutModifierKey(event.key)) return;
			event.preventDefault();
			event.stopPropagation();
			const nextDraft = normalizeShortcut({
				key: "",
				meta: event.metaKey,
				ctrl: event.ctrlKey,
				alt: event.altKey,
				shift: event.shiftKey,
			});
			setRecordingDraft(hasPressedModifier(nextDraft) ? nextDraft : null);
		},
		[recordingActionId],
	);

	useEffect(() => {
		if (!recordingActionId) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			event.stopImmediatePropagation();
			void handleRecordKeyDown(recordingActionId, event);
		};
		const handleKeyUp = (event: KeyboardEvent) => {
			event.stopImmediatePropagation();
			handleRecordKeyUp(event);
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		window.addEventListener("keyup", handleKeyUp, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
			window.removeEventListener("keyup", handleKeyUp, { capture: true });
		};
	}, [recordingActionId, handleRecordKeyDown, handleRecordKeyUp]);

	return (
		<div className="settingsPane shortcutsPane">
			<div className="settingsGrid">
				<div className="shortcutsToolbar">
					<input
						className="shortcutsSearchInput"
						type="search"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
						placeholder="Search actions, categories, or shortcuts"
					/>
					{error ? <div className="shortcutError">{error}</div> : null}
				</div>
				{groupedActions.map(([category, categoryActions]) => (
					<SettingsSection key={category} title={t(`categories.${category}`)}>
						{categoryActions.map((action) => {
							const isRecording = recordingActionId === action.id;
							const isBusy = busyActionId === action.id;
							return (
								<SettingsRow
									key={action.id}
									label={t(`commands.${action.id}.label`)}
									description={t(`commands.${action.id}.description`)}
									stacked
								>
									<div className="shortcutBindingRow">
										<button
											type="button"
											className={
												isRecording
													? "shortcutRecordButton is-recording"
													: "shortcutRecordButton"
											}
											onClick={() => {
												setError("");
												setRecordingDraft(null);
												setRecordingActionId((current) => {
													return current === action.id ? null : action.id;
												});
											}}
											disabled={isBusy}
										>
											{isRecording
												? formatRecordingPrompt(recordingDraft)
												: formatBinding(action.binding)}
										</button>
										<div className="shortcutBindingActions">
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="shortcutActionButton"
												disabled={isBusy}
												onClick={() => void handleDisable(action.id)}
												aria-label="Disable shortcut"
												title="Disable shortcut"
											>
												<Trash2 size="var(--icon-md)" />
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="shortcutActionButton"
												disabled={isBusy}
												onClick={() => void handleReset(action.id)}
												aria-label="Reset shortcut"
												title="Reset shortcut"
											>
												<HugeiconsIcon
													icon={ReloadIcon}
													size="var(--icon-md)"
													strokeWidth={0.9}
												/>
											</Button>
										</div>
									</div>
								</SettingsRow>
							);
						})}
					</SettingsSection>
				))}
			</div>
		</div>
	);
}
