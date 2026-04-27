import { useCallback, useEffect, useState } from "react";
import {
	type EditorTextColor,
	isEditorTextColor,
} from "../components/editor/textColors";
import { statusColorKey } from "../lib/statusProperties";
import { invoke } from "../lib/tauri";

function normalizeColors(
	colors: Record<string, string>,
): Record<string, EditorTextColor> {
	const next: Record<string, EditorTextColor> = {};
	for (const [statusId, color] of Object.entries(colors)) {
		if (isEditorTextColor(color)) {
			next[statusId] = color;
		}
	}
	return next;
}

export function useStatusPropertyColors() {
	const [colors, setColors] = useState<Record<string, EditorTextColor>>({});

	useEffect(() => {
		let cancelled = false;
		void invoke("databases_status_colors_get")
			.then((nextColors) => {
				if (!cancelled) {
					setColors(normalizeColors(nextColors));
				}
			})
			.catch(() => {
				if (!cancelled) {
					setColors({});
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const setStatusColor = useCallback(
		(value: string, color: EditorTextColor | null) => {
			const statusId = statusColorKey(value);
			if (!statusId) return;
			setColors((current) => {
				if (color) {
					return { ...current, [statusId]: color };
				}
				const next = { ...current };
				delete next[statusId];
				return next;
			});
			void invoke("databases_status_color_set", {
				status: statusId,
				color,
			}).catch(() => undefined);
		},
		[],
	);

	return { colors, setStatusColor };
}
