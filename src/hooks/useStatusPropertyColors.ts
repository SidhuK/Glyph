import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { type EditorTextColor, isEditorTextColor } from "../components/editor/textColors";
import { statusColorKey } from "../lib/statusProperties";
import { invoke } from "../lib/tauri";

export const STATUS_PROPERTY_COLORS_QUERY_KEY = ["navigation", "status-property-colors"] as const;

export function normalizeStatusColors(
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
	const client = useQueryClient();
	const [colors, setColors] = useState<Record<string, EditorTextColor>>({});

	useEffect(() => {
		let cancelled = false;
		void invoke("databases_status_colors_get")
			.then((nextColors) => {
				if (!cancelled) {
					setColors(normalizeStatusColors(nextColors));
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
			let previousColor: EditorTextColor | undefined;
			setColors((current) => {
				previousColor = current[statusId];
				if (color) {
					return { ...current, [statusId]: color };
				}
				const next = { ...current };
				delete next[statusId];
				return next;
			});
			return invoke("databases_status_color_set", {
				status: statusId,
				color,
			})
				.then(() => client.invalidateQueries({ queryKey: STATUS_PROPERTY_COLORS_QUERY_KEY }))
				.catch((error) => {
					console.error("Failed to save status color", error);
					setColors((current) => {
						const stillOptimistic = color ? current[statusId] === color : !(statusId in current);
						if (!stillOptimistic) return current;
						const next = { ...current };
						if (previousColor) {
							next[statusId] = previousColor;
						} else {
							delete next[statusId];
						}
						return next;
					});
				});
		},
		[client],
	);

	return { colors, setStatusColor };
}
