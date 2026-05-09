import type { SetStateAction } from "react";

export function valueReducer<T>(state: T, action: SetStateAction<T>): T {
	return typeof action === "function"
		? (action as (current: T) => T)(state)
		: action;
}
