import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

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
}

interface SettingsSegmentedOption<T extends string> {
	label: string;
	value: T;
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
	description,
	children,
	className,
	id,
	aside,
}: SettingsSectionProps) {
	return (
		<section id={id} className={cn("settingsCard", className)}>
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">{title}</div>
					{description ? (
						<div className="settingsCardHint">{description}</div>
					) : null}
				</div>
				{aside ? <div className="settingsCardActions">{aside}</div> : null}
			</div>
			<div className="settingsSectionBody">{children}</div>
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
}: SettingsRowProps) {
	const CopyTag = htmlFor ? "label" : "div";

	return (
		<div
			className={cn(
				"settingsField",
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
		<label className="settingsToggle">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onCheckedChange(event.target.checked)}
				aria-label={ariaLabel}
				disabled={disabled}
			/>
			<span aria-hidden="true" />
		</label>
	);
}
