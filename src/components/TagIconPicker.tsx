import {
	DEFAULT_TAG_ICON_NAME,
	TAG_ICON_OPTIONS,
	type TagIconOption,
	type TagIconOverrides,
	isTagIconName,
	resolveTagIconName,
} from "../lib/tagIcons";
import {
	AppearancePicker,
	AppearancePickerIconTrigger,
} from "./AppearancePicker";

export interface TagIconPickerProps {
	tag: string;
	value?: string | null;
	overrides?: TagIconOverrides | null;
	beautifulTagsEnabled?: boolean;
	options?: readonly TagIconOption[];
	disabled?: boolean;
	className?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onChange: (iconName: string, option: TagIconOption) => void;
}

export function TagIconPicker({
	tag,
	value,
	overrides,
	beautifulTagsEnabled = true,
	options = TAG_ICON_OPTIONS,
	disabled,
	className,
	open,
	onOpenChange,
	onChange,
}: TagIconPickerProps) {
	const selectedIconName =
		value?.trim() || resolveTagIconName(tag, overrides, beautifulTagsEnabled);
	const displayIconName = isTagIconName(selectedIconName)
		? selectedIconName
		: DEFAULT_TAG_ICON_NAME;

	return (
		<AppearancePicker
			title="Choose tag icon"
			open={open}
			onOpenChange={onOpenChange}
			iconValue={displayIconName}
			defaultIconName={DEFAULT_TAG_ICON_NAME}
			iconOptions={options}
			onIconChange={(iconName, option) => {
				if (!iconName || !option) return;
				onChange(iconName, option);
			}}
			trigger={(openPicker) => (
				<AppearancePickerIconTrigger
					iconName={displayIconName}
					className={className}
					disabled={disabled}
					label={`Choose icon for ${tag}`}
					onClick={openPicker}
				/>
			)}
		/>
	);
}
