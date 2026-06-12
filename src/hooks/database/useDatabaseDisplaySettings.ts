import { useEffect, useState } from "react";
import { loadSettings } from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { useStatusPropertyColors } from "../useStatusPropertyColors";

export function useDatabaseDisplaySettings() {
	const [showDatabaseColumnColor, setShowDatabaseColumnColor] = useState(true);
	const { colors: statusColors, setStatusColor } = useStatusPropertyColors();

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (!cancelled) {
					setShowDatabaseColumnColor(settings.database.showColumnColor);
				}
			})
			.catch(() => {
				// Preserve the existing default if settings cannot be loaded.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.database?.showColumnColor === "boolean") {
			setShowDatabaseColumnColor(payload.database.showColumnColor);
		}
	});

	return {
		showDatabaseColumnColor,
		statusColors,
		setStatusColor,
	};
}
