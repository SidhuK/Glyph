import { useCallback, useRef, useState } from "react";

interface InlineRenameInputProps {
	initialValue: string;
	className: string;
	placeholder: string;
	containPointerEvents?: boolean;
	onCommit: (value: string) => boolean | Promise<boolean>;
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
		try {
			const committed = await onCommit(value);
			if (!committed) submittedRef.current = false;
		} catch (error) {
			submittedRef.current = false;
			console.error("Failed to commit inline rename", error);
		}
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
					if (event.nativeEvent.isComposing) return;
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
