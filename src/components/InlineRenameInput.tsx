import { useCallback, useRef, useState } from "react";

interface InlineRenameInputProps {
	initialValue: string;
	className: string;
	placeholder: string;
	containPointerEvents?: boolean;
	onCommit: (value: string) => unknown;
	onCancel: () => void;
}

export function InlineRenameInput({
	initialValue,
	className,
	placeholder,
	containPointerEvents = false,
	onCommit,
	onCancel,
}: InlineRenameInputProps) {
	const [value, setValue] = useState(initialValue);
	const submittedRef = useRef(false);
	const focusInput = useCallback((input: HTMLInputElement | null) => {
		input?.focus();
		input?.select();
	}, []);

	const commit = async () => {
		if (submittedRef.current) return;
		submittedRef.current = true;
		const committed = await onCommit(value);
		if (committed === false) submittedRef.current = false;
	};

	return (
		<input
			ref={focusInput}
			className={className}
			value={value}
			placeholder={placeholder}
			onFocus={(event) => event.currentTarget.select()}
			onChange={(event) => setValue(event.target.value)}
			onMouseDown={
				containPointerEvents
					? (event) => {
							event.preventDefault();
							event.stopPropagation();
						}
					: undefined
			}
			onClick={
				containPointerEvents
					? (event) => {
							event.preventDefault();
							event.stopPropagation();
						}
					: undefined
			}
			onBlur={() => void commit()}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					void commit();
					return;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					submittedRef.current = true;
					onCancel();
				}
			}}
		/>
	);
}
