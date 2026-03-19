// @vitest-environment jsdom

import { act, useEffect } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	EditorProvider,
	type EditorSaveState,
	useEditorContext,
	useEditorRegistration,
} from "./EditorContext";

// React 19 expects tests to opt into act-aware scheduling.
(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
	state: EditorSaveState | null;
	onContext: (value: CapturedEditorContext) => void;
}

interface CapturedEditorContext {
	saveCurrentEditor: () => Promise<boolean>;
	hasUnsavedChanges: () => boolean;
	getCurrentMarkdown: (relPath: string) => string | null;
}

function RegistrationHarness({ state, onContext }: HarnessProps) {
	const context = useEditorContext();
	useEditorRegistration(state);

	useEffect(() => {
		onContext(context);
	}, [context, onContext]);

	return null;
}

describe("EditorContext", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	it("keeps the registered save state current across re-renders", async () => {
		const firstSave = vi.fn(async () => {});
		const secondSave = vi.fn(async () => {});
		const captured = {
			current: null as CapturedEditorContext | null,
		};

		const firstState: EditorSaveState = {
			relPath: "notes/daily.md",
			isDirty: false,
			save: firstSave,
			getMarkdown: () => "first version",
		};
		const secondState: EditorSaveState = {
			relPath: "notes/daily.md",
			isDirty: true,
			save: secondSave,
			getMarkdown: () => "second version",
		};

		await act(async () => {
			root.render(
				<EditorProvider>
					<RegistrationHarness
						state={firstState}
						onContext={(value) => {
							captured.current = value;
						}}
					/>
				</EditorProvider>,
			);
		});

		await act(async () => {
			root.render(
				<EditorProvider>
					<RegistrationHarness
						state={secondState}
						onContext={(value) => {
							captured.current = value;
						}}
					/>
				</EditorProvider>,
			);
		});

		expect(captured.current).not.toBeNull();
		const registeredContext = captured.current;
		if (!registeredContext) {
			throw new Error("Expected editor context to be available");
		}
		expect(registeredContext.hasUnsavedChanges()).toBe(true);
		expect(registeredContext.getCurrentMarkdown("notes/daily.md")).toBe(
			"second version",
		);

		await act(async () => {
			await registeredContext.saveCurrentEditor();
		});

		expect(firstSave).not.toHaveBeenCalled();
		expect(secondSave).toHaveBeenCalledTimes(1);
	});
});
