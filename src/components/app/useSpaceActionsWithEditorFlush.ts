import { useCallback } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";

interface UseSpaceActionsWithEditorFlushOptions {
	spacePath: string | null;
	saveCurrentEditor: () => Promise<boolean>;
	setError: (error: string) => void;
	switchSpace: (path: string) => Promise<void>;
	switchToNextSpace: () => Promise<void>;
	switchToPreviousSpace: () => Promise<void>;
	onOpenSpace: () => Promise<void>;
	onOpenSpaceAtPath: (path: string) => Promise<void>;
	onCreateSpace: () => Promise<void>;
	closeSpace: () => Promise<void>;
}

export function useSpaceActionsWithEditorFlush({
	spacePath,
	saveCurrentEditor,
	setError,
	switchSpace,
	switchToNextSpace,
	switchToPreviousSpace,
	onOpenSpace,
	onOpenSpaceAtPath,
	onCreateSpace,
	closeSpace,
}: UseSpaceActionsWithEditorFlushOptions) {
	const runSpaceActionWithEditorFlush = useCallback(
		async (action: () => Promise<void>) => {
			try {
				const saved = await saveCurrentEditor();
				if (!saved) {
					setError("Could not save your changes before switching spaces.");
					return;
				}
				await action();
			} catch (err) {
				setError(extractErrorMessage(err));
			}
		},
		[saveCurrentEditor, setError],
	);

	const handleSwitchSpace = useCallback(
		(path: string) => {
			if (path === spacePath) return;
			void runSpaceActionWithEditorFlush(() => switchSpace(path));
		},
		[runSpaceActionWithEditorFlush, spacePath, switchSpace],
	);

	const handleSwitchNextSpace = useCallback(() => {
		void runSpaceActionWithEditorFlush(() => switchToNextSpace());
	}, [runSpaceActionWithEditorFlush, switchToNextSpace]);

	const handleSwitchPreviousSpace = useCallback(() => {
		void runSpaceActionWithEditorFlush(() => switchToPreviousSpace());
	}, [runSpaceActionWithEditorFlush, switchToPreviousSpace]);

	const handleOpenSpace = useCallback(() => {
		void runSpaceActionWithEditorFlush(onOpenSpace);
	}, [onOpenSpace, runSpaceActionWithEditorFlush]);

	const handleOpenSpaceAtPath = useCallback(
		(path: string) => {
			void runSpaceActionWithEditorFlush(() => onOpenSpaceAtPath(path));
		},
		[onOpenSpaceAtPath, runSpaceActionWithEditorFlush],
	);

	const handleCreateSpace = useCallback(() => {
		void runSpaceActionWithEditorFlush(onCreateSpace);
	}, [onCreateSpace, runSpaceActionWithEditorFlush]);

	const handleCloseSpace = useCallback(async () => {
		await runSpaceActionWithEditorFlush(closeSpace);
	}, [closeSpace, runSpaceActionWithEditorFlush]);

	return {
		handleSwitchSpace,
		handleSwitchNextSpace,
		handleSwitchPreviousSpace,
		handleOpenSpace,
		handleOpenSpaceAtPath,
		handleCreateSpace,
		handleCloseSpace,
	};
}
