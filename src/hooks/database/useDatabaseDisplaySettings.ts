import { useEffect, useRef, useState } from "react";
import { loadSettings } from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { useStatusPropertyColors } from "../useStatusPropertyColors";

export function useDatabaseDisplaySettings() {
	const [showDatabaseColumnColor, setShowDatabaseColumnColor] = useState(true);
	const settingsVersionRef = useRef(0);
	const { colors: statusColors, setStatusColor } = useStatusPropertyColors();

	useEffect(() => {
		let cancelled = false;
		const loadId = settingsVersionRef.current + 1;
		settingsVersionRef.current = loadId;
		void loadSettings()
			.then((settings) => {
				if (!cancelled && loadId === settingsVersionRef.current) {
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
			settingsVersionRef.current += 1;
			setShowDatabaseColumnColor(payload.database.showColumnColor);
		}
	});

	return {
		showDatabaseColumnColor,
		statusColors,
		setStatusColor,
	};
}
