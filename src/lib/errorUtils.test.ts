import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./errorUtils";
import { TauriInvokeError } from "./tauri";

describe("errorUtils", () => {
	it("extracts message from TauriInvokeError", () => {
		const err = new TauriInvokeError("invoke failed", { code: "E_FAIL" });
		expect(extractErrorMessage(err)).toBe("invoke failed");
	});

	it("extracts message from standard Error", () => {
		expect(extractErrorMessage(new Error("boom"))).toBe("boom");
	});

	it("stringifies unknown values", () => {
		expect(extractErrorMessage("plain")).toBe("plain");
		expect(extractErrorMessage(42)).toBe("42");
	});
});
