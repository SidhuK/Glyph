interface TaskCheckboxProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
}

export function TaskCheckbox({ checked, onChange }: TaskCheckboxProps) {
	return (
		<label className="tasksCheckbox">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				aria-label={checked ? "Uncheck task" : "Check task"}
			/>
		</label>
	);
}
