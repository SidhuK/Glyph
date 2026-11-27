import { useCallback, useRef, useState } from "react";

const UNDO_NOTICE_MS = 5000;

type UndoNoticeKind = "completed" | "updated";

export interface UndoNotice {
	kind: UndoNoticeKind;
	undo: () => void;
}

export function useUndoNotice() {
	const [notice, setNotice] = useState<UndoNotice | null>(null);
	const timerRef = useRef<number | null>(null);

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);

	const dismiss = () => {
		clearTimer();
		setNotice(null);
	};

	const show = (next: UndoNotice) => {
		clearTimer();
		setNotice(next);
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			setNotice(null);
		}, UNDO_NOTICE_MS);
	};

	return { notice, show, dismiss, clearTimer };
}
