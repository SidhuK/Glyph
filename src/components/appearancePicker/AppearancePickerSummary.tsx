import { m } from "motion/react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { AppearanceIcon } from "../AppearanceIcon";
import { Shuffle } from "../Icons";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";

interface AppearancePickerSummaryProps {
	iconName: string;
	title: string;
	subtitle: string;
	colorStyle?: CSSProperties;
	onShuffle: () => void;
	onReset?: () => void;
}

export function AppearancePickerSummary({
	iconName,
	title,
	subtitle,
	colorStyle,
	onShuffle,
	onReset,
}: AppearancePickerSummaryProps) {
	const { t } = useTranslation("shell");
	return (
		<div className="appearancePickerSummary">
			<div className="appearancePickerPreview" style={colorStyle} aria-hidden="true">
				<m.span
					key={iconName}
					className="appearancePickerPreviewIcon"
					initial={{ scale: 0.6, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={springPresets.bouncy}
				>
					<AppearanceIcon iconName={iconName} size="var(--icon-xl)" />
				</m.span>
			</div>
			<div className="appearancePickerHeading">
				<div className="appearancePickerTitle">{title}</div>
				<div className="appearancePickerSubtitle">{subtitle}</div>
			</div>
			<div className="appearancePickerActions">
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					title={t("appearancePicker.shuffle")}
					aria-label={t("appearancePicker.shuffle")}
					onClick={onShuffle}
				>
					<Shuffle size="var(--icon-sm)" />
				</Button>
				{onReset ? (
					<Button type="button" variant="ghost" size="xs" onClick={onReset}>
						{t("appearancePicker.reset")}
					</Button>
				) : null}
			</div>
		</div>
	);
}
