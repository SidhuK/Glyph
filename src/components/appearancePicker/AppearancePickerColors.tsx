import { useTranslation } from "react-i18next";
import {
	type EditorTextColor,
	type EditorTextColorOption,
	getEditorTextColorLabel,
} from "../editor/textColors";

interface AppearancePickerColorsProps {
	value: EditorTextColor | null;
	options: readonly EditorTextColorOption[];
	onChange: (color: EditorTextColor | null) => void;
	/** `undefined` clears the hover preview; `null` previews the default color. */
	onHover: (color: EditorTextColor | null | undefined) => void;
}

export function AppearancePickerColors({
	value,
	options,
	onChange,
	onHover,
}: AppearancePickerColorsProps) {
	const { t } = useTranslation("shell");
	return (
		<div
			className="appearancePickerColors"
			role="group"
			aria-label={t("appearancePicker.color")}
			onMouseLeave={() => onHover(undefined)}
			onBlur={() => onHover(undefined)}
		>
			{[null, ...options].map((color) => {
				const id = color?.id ?? null;
				const label = id ? getEditorTextColorLabel(id) : t("appearancePicker.defaultColor");
				return (
					<button
						key={id ?? "default"}
						type="button"
						aria-pressed={value === id}
						title={label}
						aria-label={label}
						className={
							color
								? "appearancePickerSwatch"
								: "appearancePickerSwatch appearancePickerSwatchDefault"
						}
						style={color ? { color: `var(${color.cssVar})` } : undefined}
						onMouseEnter={() => onHover(id)}
						onFocus={() => onHover(id)}
						onClick={() => onChange(id)}
					/>
				);
			})}
		</div>
	);
}
