import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { basename, splitEditableFileName } from "../../utils/path";

interface ActiveFileTitleProps {
	path: string | null;
	onRenameFile: (path: string, nextName: string) => Promise<string | null>;
}

export function ActiveFileTitle({ path, onRenameFile }: ActiveFileTitleProps) {
	const fileName = path ? basename(path) : "";
	const editableName = splitEditableFileName(fileName);
	const activeTitleKey = path ?? "";
	const [isRenaming, setIsRenaming] = useState(false);
	const [draftName, setDraftName] = useState(editableName.stem);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const submittedRef = useRef(false);

	useEffect(() => {
		setIsRenaming(false);
		setDraftName(activeTitleKey ? editableName.stem : "");
		submittedRef.current = false;
	}, [activeTitleKey, editableName.stem]);

	useEffect(() => {
		if (!isRenaming) return;
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [isRenaming]);

	const commitRename = useCallback(async () => {
		if (!path || submittedRef.current) return;
		submittedRef.current = true;
		const fallbackName = editableName.stem || "Untitled";
		const nextStem = draftName.trim() || fallbackName;
		const nextName = `${nextStem}${editableName.ext || ".md"}`;
		if (nextName === fileName) {
			setIsRenaming(false);
			return;
		}
		try {
			await onRenameFile(path, nextName);
		} finally {
			setIsRenaming(false);
		}
	}, [
		draftName,
		editableName.ext,
		editableName.stem,
		fileName,
		onRenameFile,
		path,
	]);

	const cancelRename = useCallback(() => {
		submittedRef.current = true;
		setDraftName(editableName.stem);
		setIsRenaming(false);
	}, [editableName.stem]);

	if (!path) return null;

	if (isRenaming) {
		return (
			<input
				ref={inputRef}
				className="plainTextInput mainTabActiveTitleInput"
				value={draftName}
				placeholder="Untitled"
				aria-label="Rename current file"
				onChange={(event) => {
					submittedRef.current = false;
					setDraftName(event.target.value);
				}}
				onBlur={() => void commitRename()}
				onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
					if (event.key === "Enter") {
						event.preventDefault();
						void commitRename();
						return;
					}
					if (event.key === "Escape") {
						event.preventDefault();
						cancelRename();
					}
				}}
			/>
		);
	}

	return (
		<button
			type="button"
			className="mainTabActiveTitle"
			title={`Rename ${fileName}`}
			aria-label={`Rename ${fileName}`}
			onClick={() => {
				submittedRef.current = false;
				setDraftName(editableName.stem);
				setIsRenaming(true);
			}}
		>
			<span className="mainTabActiveTitleText">{editableName.stem}</span>
		</button>
	);
}
