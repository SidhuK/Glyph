import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Switch } from "../ui/shadcn/switch";

interface SettingsSectionProps {
	title: string;
	description?: ReactNode;
	children: ReactNode;
	className?: string;
	id?: string;
	aside?: ReactNode;
}

interface SettingsRowProps {
	label: ReactNode;
	htmlFor?: string;
	description?: ReactNode;
	children: ReactNode;
	className?: string;
	stacked?: boolean;
	interactive?: boolean;
}

interface SettingsSegmentedOption<T extends string> {
	label: string;
	value: T;
	icon?: ReactNode;
}

interface SettingsSegmentedProps<T extends string> {
	value: T;
	options: SettingsSegmentedOption<T>[];
	onChange: (value: T) => void;
	ariaLabel: string;
	disabled?: boolean;
}

interface SettingsToggleProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	ariaLabel: string;
	disabled?: boolean;
}

export function SettingsSection({
	title,
	children,
	className,
	id,
	aside,
}: SettingsSectionProps) {
	return (
		<section id={id} className={cn("settingsSection", className)}>
			<div className="settingsSectionHeader">
				<div className="settingsCardTitle">{title}</div>
				{aside ? <div className="settingsCardActions">{aside}</div> : null}
			</div>
			<div className="settingsCard">
				<div className="settingsSectionBody">{children}</div>
			</div>
		</section>
	);
}

export function SettingsRow({
	label,
	htmlFor,
	description,
	children,
	className,
	stacked = false,
	interactive = true,
}: SettingsRowProps) {
	const CopyTag = htmlFor ? "label" : "div";

	return (
		<div
			className={cn(
				"settingsField",
				interactive && "settingsFieldInteractive",
				stacked && "settingsFieldStacked",
				className,
			)}
		>
			<CopyTag className="settingsFieldCopy" htmlFor={htmlFor}>
				<div className="settingsLabel">{label}</div>
				{description ? <div className="settingsHelp">{description}</div> : null}
			</CopyTag>
			<div
				className={cn(
					"settingsFieldControl",
					stacked && "settingsFieldControlStacked",
				)}
			>
				{children}
			</div>
		</div>
	);
}

export function SettingsSegmented<T extends string>({
	value,
	options,
	onChange,
	ariaLabel,
	disabled,
}: SettingsSegmentedProps<T>) {
	return (
		<SegmentedControl
			value={value}
			options={options}
			onChange={onChange}
			ariaLabel={ariaLabel}
			disabled={disabled}
			className="settingsSegmented"
			buttonClassName="settingsSegmentedButton"
			iconClassName="settingsSegmentedIcon"
		/>
	);
}

export function SettingsToggle({
	checked,
	onCheckedChange,
	ariaLabel,
	disabled,
}: SettingsToggleProps) {
	return (
		<Switch
			checked={checked}
			onCheckedChange={onCheckedChange}
			aria-label={ariaLabel}
			disabled={disabled}
			className="shrink-0"
		/>
	);
}

interface SettingsValueCardProps {
	icon: ReactNode;
	value: string;
	mono?: boolean;
}

export function SettingsValueCard({
	icon,
	value,
	mono = false,
}: SettingsValueCardProps) {
	return (
		<div className="settingsValueCard">
			<div className="settingsValueIcon" aria-hidden="true">
				{icon}
			</div>
			<div className={cn("settingsValueText", { mono })}>{value}</div>
		</div>
	);
}
