export type DiffOp =
	| { type: "equal"; line: string }
	| { type: "insert"; line: string }
	| { type: "delete"; line: string };

function myersDiff(a: string[], b: string[], maxD: number): DiffOp[] | null {
	const n = a.length;
	const m = b.length;
	const max = n + m;
	const v = new Map<number, number>();
	v.set(1, 0);
	const trace: Array<Map<number, number>> = [];

	for (let d = 0; d <= Math.min(max, maxD); d++) {
		const vNext = new Map(v);
		trace.push(vNext);
		for (let k = -d; k <= d; k += 2) {
			const x =
				k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))
					? (v.get(k + 1) ?? 0)
					: (v.get(k - 1) ?? 0) + 1;
			let y = x - k;
			let x2 = x;
			while (x2 < n && y < m && a[x2] === b[y]) {
				x2++;
				y++;
			}
			vNext.set(k, x2);
			if (x2 >= n && y >= m) {
				// backtrack
				const ops: DiffOp[] = [];
				let xBack = n;
				let yBack = m;
				for (let dBack = trace.length - 1; dBack >= 0; dBack--) {
					const vBack = trace[dBack];
					if (!vBack) continue;
					const kBack = xBack - yBack;
					const kPrev =
						kBack === -dBack ||
						(kBack !== dBack &&
							(vBack.get(kBack - 1) ?? 0) < (vBack.get(kBack + 1) ?? 0))
							? kBack + 1
							: kBack - 1;
					const xPrev =
						kPrev === kBack + 1
							? (vBack.get(kPrev) ?? 0)
							: (vBack.get(kPrev) ?? 0) + 1;
					const yPrev = xPrev - kPrev;

					while (xBack > xPrev && yBack > yPrev) {
						const line = a[xBack - 1];
						if (line == null) break;
						ops.push({ type: "equal", line });
						xBack--;
						yBack--;
					}

					if (dBack === 0) break;
					if (xBack === xPrev) {
						const line = b[yBack - 1];
						if (line == null) break;
						ops.push({ type: "insert", line });
						yBack--;
					} else {
						const line = a[xBack - 1];
						if (line == null) break;
						ops.push({ type: "delete", line });
						xBack--;
					}
				}
				return ops.reverse();
			}
		}
		v.clear();
		for (const [k, val] of vNext) v.set(k, val);
	}

	return null;
}

export function unifiedDiff(
	before: string,
	after: string,
	opts?: { contextLines?: number; maxDiffLines?: number },
): string {
	const context = opts?.contextLines ?? 3;
	const maxDiffLines = opts?.maxDiffLines ?? 4000;
	const a = before.replace(/\r\n/g, "\n").split("\n");
	const b = after.replace(/\r\n/g, "\n").split("\n");
	const ops = myersDiff(a, b, 10_000);
	if (!ops) return "Diff too large to compute.";

	const lines: string[] = [];
	let changes = 0;

	// Build hunks with minimal context: we’ll include all ops but collapse long equal runs.
	let i = 0;
	while (i < ops.length) {
		// find next change
		let j = i;
		while (j < ops.length && ops[j]?.type === "equal") j++;
		if (j >= ops.length) break;

		const hunkStart = Math.max(i, j - context);
		let hunkEnd = j;
		while (hunkEnd < ops.length && ops[hunkEnd]?.type !== "equal") hunkEnd++;
		hunkEnd = Math.min(ops.length, hunkEnd + context);

		if (hunkStart > 0) lines.push("…");
		for (let k = hunkStart; k < hunkEnd; k++) {
			const op = ops[k];
			if (!op) continue;
			if (op.type === "equal") lines.push(`  ${op.line}`);
			if (op.type === "delete") {
				lines.push(`- ${op.line}`);
				changes++;
			}
			if (op.type === "insert") {
				lines.push(`+ ${op.line}`);
				changes++;
			}
			if (lines.length >= maxDiffLines) return "Diff output truncated.";
		}
		i = hunkEnd;
	}

	if (!changes) return "No changes.";
	return lines.join("\n");
}
