import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { applyUiCornerRadius } from "../../lib/appearance";
import {
	DEFAULT_UI_CORNER_RADIUS_STYLE,
	type UiCornerRadiusStyle,
	loadSettings,
	setUiCornerRadiusStyle,
} from "../../lib/settings";

interface UseAppearanceCornerRadiusOptions {
	setError: Dispatch<SetStateAction<string>>;
}

export function useAppearanceCornerRadius({
	setError,
}: UseAppearanceCornerRadiusOptions) {
	const [cornerRadiusStyle, setCornerRadiusStyleState] =
		useState<UiCornerRadiusStyle>(DEFAULT_UI_CORNER_RADIUS_STYLE);
	const cornerRadiusMutationRef = useRef(0);
	const persistedCornerRadiusStyleRef = useRef<UiCornerRadiusStyle>(
		DEFAULT_UI_CORNER_RADIUS_STYLE,
	);
	const cornerRadiusWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve());

	const applyCornerRadiusState = useCallback((next: UiCornerRadiusStyle) => {
		setCornerRadiusStyleState(next);
		applyUiCornerRadius(next);
	}, []);

	useEffect(() => {
		let cancelled = false;
		const hydrationMutationId = cornerRadiusMutationRef.current;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (
					cancelled ||
					cornerRadiusMutationRef.current !== hydrationMutationId
				) {
					return;
				}
				persistedCornerRadiusStyleRef.current = settings.ui.cornerRadiusStyle;
				applyCornerRadiusState(settings.ui.cornerRadiusStyle);
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Failed to load settings");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [applyCornerRadiusState, setError]);

	const onCornerRadiusStyleChange = useCallback(
		async (next: UiCornerRadiusStyle) => {
			const mutationId = cornerRadiusMutationRef.current + 1;
			cornerRadiusMutationRef.current = mutationId;
			setError("");
			applyCornerRadiusState(next);
			const persist = cornerRadiusWriteQueueRef.current.then(() =>
				setUiCornerRadiusStyle(next),
			);
			cornerRadiusWriteQueueRef.current = persist.catch(() => {});
			try {
				await persist;
				persistedCornerRadiusStyleRef.current = next;
			} catch (e) {
				if (cornerRadiusMutationRef.current !== mutationId) return;
				applyCornerRadiusState(persistedCornerRadiusStyleRef.current);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[applyCornerRadiusState, setError],
	);

	return {
		cornerRadiusStyle,
		onCornerRadiusStyleChange,
	};
}
