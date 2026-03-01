import {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type DatabaseCellValue,
	type DatabaseColumn,
	type DatabaseConfig,
	type DatabaseLoadResult,
	type DatabaseRow,
	invoke,
} from "../../lib/tauri";

function applyCellValueToRow(
	row: DatabaseRow,
	column: DatabaseColumn,
	value: DatabaseCellValue,
): DatabaseRow {
	switch (column.type) {
		case "title":
			return {
				...row,
				title: value.value_text ?? "",
			};
		case "tags":
			return {
				...row,
				tags: value.value_list,
			};
		case "property": {
			const propertyKey = column.property_key ?? "";
			if (!propertyKey) return row;
			return {
				...row,
				properties: {
					...row.properties,
					[propertyKey]: {
						kind: value.kind || column.property_kind || "text",
						value_text: value.value_text ?? null,
						value_bool: value.value_bool ?? null,
						value_list: value.value_list,
					},
				},
			};
		}
		case "path":
		case "created":
		case "updated":
			return row;
	}
}

interface UseDatabaseNoteResult {
	data: DatabaseLoadResult | null;
	loading: boolean;
	error: string;
	reload: () => Promise<void>;
	saveConfig: (config: DatabaseConfig) => Promise<void>;
	updateCell: (
		notePath: string,
		column: DatabaseColumn,
		value: DatabaseCellValue,
	) => Promise<void>;
	createRow: (title?: string) => Promise<string | null>;
}

export function useDatabaseNote(
	relPath: string,
	enabled = true,
): UseDatabaseNoteResult {
	const [data, setData] = useState<DatabaseLoadResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const requestVersionRef = useRef(0);

	const reload = useCallback(async () => {
		const version = requestVersionRef.current + 1;
		requestVersionRef.current = version;
		setLoading(true);
		setError("");
		try {
			const next = await invoke("database_load", { path: relPath, limit: 500 });
			if (requestVersionRef.current !== version) return;
			setData(next);
		} catch (error) {
			if (requestVersionRef.current !== version) return;
			setData(null);
			setError(extractErrorMessage(error));
		} finally {
			if (requestVersionRef.current === version) {
				setLoading(false);
			}
		}
	}, [relPath]);

	useEffect(() => {
		if (!enabled) {
			setLoading(false);
			setError("");
			setData(null);
			return;
		}
		void reload();
	}, [enabled, reload]);

	const saveConfig = useCallback(
		async (config: DatabaseConfig) => {
			requestVersionRef.current += 1;
			const saved = await invoke("database_save_config", {
				path: relPath,
				config,
			});
			startTransition(() => {
				setData((current) =>
					current
						? {
								...current,
								config: saved,
							}
						: current,
				);
			});
			void reload();
		},
		[relPath, reload],
	);

	const updateCell = useCallback(
		async (
			notePath: string,
			column: DatabaseColumn,
			value: DatabaseCellValue,
		) => {
			requestVersionRef.current += 1;
			setData((current) => {
				if (!current) return current;
				return {
					...current,
					rows: current.rows.map((entry) =>
						entry.note_path === notePath
							? applyCellValueToRow(entry, column, value)
							: entry,
					),
				};
			});
			try {
				const row = await invoke("database_update_cell", {
					note_path: notePath,
					column,
					value,
				});
				startTransition(() => {
					setData((current) => {
						if (!current) return current;
						return {
							...current,
							rows: current.rows.map((entry) =>
								entry.note_path === notePath ? row : entry,
							),
						};
					});
				});
			} catch (error) {
				void reload();
				throw error;
			}
			void reload();
		},
		[reload],
	);

	const createRow = useCallback(
		async (title?: string) => {
			requestVersionRef.current += 1;
			const created = await invoke("database_create_row", {
				database_path: relPath,
				title: title ?? null,
			});
			startTransition(() => {
				setData((current) => {
					if (!current) return current;
					return {
						...current,
						rows: [created.row, ...current.rows],
					};
				});
			});
			void reload();
			return created.note_path;
		},
		[relPath, reload],
	);

	return {
		data,
		loading,
		error,
		reload,
		saveConfig,
		updateCell,
		createRow,
	};
}
