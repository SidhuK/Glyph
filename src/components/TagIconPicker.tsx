import {
	DEFAULT_TAG_ICON_NAME,
	TAG_ICON_OPTIONS,
	type TagIconOption,
	type TagIconOverrides,
	isTagIconName,
	normalizeTagIconKey,
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
	onChange: (iconName: string | null, option: TagIconOption | null) => void;
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
	const defaultIconName = resolveTagIconName(tag, null, beautifulTagsEnabled);
	const defaultDisplayIconName = isTagIconName(defaultIconName)
		? defaultIconName
		: DEFAULT_TAG_ICON_NAME;
	const overrideIconName =
		value === undefined ? resolveOverrideIconName(tag, overrides) : value;

	return (
		<AppearancePicker
			title="Choose tag icon"
			open={open}
			onOpenChange={onOpenChange}
			iconValue={overrideIconName}
			defaultIconName={defaultDisplayIconName}
			iconOptions={options}
			showDefaultIcon
			onIconChange={(iconName, option) => {
				if (iconName === null && option === null) {
					onChange(null, null);
					return;
				}
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

function resolveOverrideIconName(
	tag: string,
	overrides: TagIconOverrides | null | undefined,
): string | null {
	if (!overrides) return null;

	const normalizedTag = normalizeTagIconKey(tag);
	const keys = [tag, tag.trim()];
	if (normalizedTag) keys.push(normalizedTag, `#${normalizedTag}`);

	for (const key of new Set(keys.filter(Boolean))) {
		if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
		const iconName = overrides[key];
		return typeof iconName === "string" ? iconName.trim() || null : null;
	}

	return null;
}
