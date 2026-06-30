import { useTranslation } from "react-i18next";
import {
	defaultDatabaseColumnIconName,
	resolveDatabaseColumnIconName,
} from "../../lib/database/columnIcons";
import type { DatabaseColumn } from "../../lib/database/types";
import {
	AppearancePicker,
	AppearancePickerIconTrigger,
} from "../AppearancePicker";

interface DatabaseColumnIconPickerProps {
	column: DatabaseColumn;
	className?: string;
	onChange: (iconName: string | null) => void;
}

export function DatabaseColumnIconPicker({
	column,
	className,
	onChange,
}: DatabaseColumnIconPickerProps) {
	const { t } = useTranslation("ui");
	const defaultIconName = defaultDatabaseColumnIconName(column);
	const displayIconName = resolveDatabaseColumnIconName(column);

	return (
		<AppearancePicker
			title={t("database.chooseColumnIcon")}
			iconValue={column.icon ?? null}
			defaultIconName={defaultIconName}
			showDefaultIcon
			onIconChange={(iconName) => onChange(iconName)}
			trigger={(openPicker) => (
				<AppearancePickerIconTrigger
					iconName={displayIconName}
					className={className}
					label={t("database.cell.chooseIconFor", { label: column.label })}
					onClick={openPicker}
				/>
			)}
		/>
	);
}
