import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type EditorSavePulse = "saved" | "reloaded";

const EDITOR_SAVE_PULSE_MS = 1400;

export function useEditorSaveIndicator() {
	const { t } = useTranslation("ui");
	const [saving, setSaving] = useState(false);
	const [loading, setLoading] = useState(false);
	const [pulse, setPulse] = useState<EditorSavePulse | null>(null);
	const pulseTimerRef = useRef<number | null>(null);

	const clearPulseTimer = useCallback(() => {
		if (pulseTimerRef.current !== null) {
			window.clearTimeout(pulseTimerRef.current);
			pulseTimerRef.current = null;
		}
	}, []);

	const flashPulse = useCallback(
		(next: EditorSavePulse) => {
			clearPulseTimer();
			setPulse(next);
			pulseTimerRef.current = window.setTimeout(() => {
				pulseTimerRef.current = null;
				setPulse((current) => (current === next ? null : current));
			}, EDITOR_SAVE_PULSE_MS);
		},
		[clearPulseTimer],
	);

	const clearPulse = useCallback(() => {
		clearPulseTimer();
		setPulse(null);
	}, [clearPulseTimer]);

	useEffect(() => () => clearPulseTimer(), [clearPulseTimer]);

	const resolveLabel = useCallback(
		(options: {
			isDirty: boolean;
			saving?: boolean;
			autosaveBusy?: boolean;
			idleLabel?: string | null;
			hasSavedBefore?: boolean;
		}): string | null => {
			if (loading) return t("noteInfo.save.opening");
			if (saving || options.saving || options.autosaveBusy) {
				return t("noteInfo.save.saving");
			}
			if (options.isDirty) return t("noteInfo.save.edited");
			if (pulse === "reloaded") return t("noteInfo.save.fresh");
			if (pulse === "saved") return t("noteInfo.save.saved");
			if (options.idleLabel === null) return null;
			if (options.idleLabel !== undefined) return options.idleLabel;
			return options.hasSavedBefore
				? t("noteInfo.save.saved")
				: t("noteInfo.save.ready");
		},
		[loading, pulse, saving, t],
	);

	const resolveState = useCallback(
		(options: {
			isDirty: boolean;
			saving?: boolean;
			autosaveBusy?: boolean;
		}): "loading" | "saving" | "edited" | "saved" | undefined => {
			if (loading) return "loading";
			if (saving || options.saving || options.autosaveBusy) return "saving";
			if (options.isDirty) return "edited";
			if (pulse === "saved") return "saved";
			return undefined;
		},
		[loading, pulse, saving],
	);

	return {
		saving,
		setSaving,
		loading,
		setLoading,
		pulse,
		flashPulse,
		clearPulse,
		resolveLabel,
		resolveState,
	};
}
