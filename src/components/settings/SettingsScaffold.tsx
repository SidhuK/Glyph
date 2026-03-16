import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Toggle } from "../base/toggle/toggle";

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
		<fieldset className="settingsSegmented">
			<legend className="sr-only">{ariaLabel}</legend>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					className={value === option.value ? "active" : ""}
					aria-pressed={value === option.value}
					disabled={disabled}
					onClick={() => onChange(option.value)}
				>
					{option.icon ? (
						<span className="settingsSegmentedIcon" aria-hidden="true">
							{option.icon}
						</span>
					) : null}
					{option.label}
				</button>
			))}
		</fieldset>
	);
}

export function SettingsToggle({
	checked,
	onCheckedChange,
	ariaLabel,
	disabled,
}: SettingsToggleProps) {
	return (
		<Toggle
			slim
			size="sm"
			checked={checked}
			onCheckedChange={onCheckedChange}
			ariaLabel={ariaLabel}
			disabled={disabled}
		/>
	);
}
