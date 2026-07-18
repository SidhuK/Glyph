# Glyph Implementation Plans

Reconciled by the `improve` skill at commit `d400dbba` on 2026-07-17. Execute in
the order below unless dependency notes say otherwise. Every executor should
read its plan fully, honor STOP conditions, run the listed gates without
starting a dev server, and update its status row.

**Wayfinder map:** [Deep-audit remediation path](https://github.com/SidhuK/Glyph/issues/367)
tracks these plans as GitHub child issues (grouped where noted; decision gates
split only for 001 / 019 / 020 / 022 / 023). Many wayfinder children were
canceled 2026-07-18 as not-planned / wontfix / no-go; rejected rows below
reflect that. Plan 001 waves stay TODO — their canceled Linear tickets were
thin duplicates of canonical work, not plan kills (see Linear housekeeping).

Status values: TODO | IN PROGRESS | DONE | BLOCKED (reason) | REJECTED (reason)

## Recommended execution order and status

| Order | Plan | Title | Priority | Effort | Depends on | Status |
|---:|---:|---|---:|---:|---|---|
| 1 | [002](002-strip-git-remote-credentials.md) | Strip credentials from persisted Git remotes | P1 | S | — | REJECTED (threat model mismatch; local credential hygiene not product priority for single-user desktop — KAR-137/#368) |
| 2 | [003](003-atomic-tmp-collision-proof.md) | Make atomic temporary files collision-proof | P1 | S | — | REJECTED (wontfix; concurrent staging-temp race not real usage — KAR-138/#369) |
| 3 | [004](004-trash-before-index-removal.md) | Trash notes before removing index entries | P1 | S | — | REJECTED (wontfix; Trash-fail-after-deindex uncommon/recoverable — KAR-138/#369) |
| 4 | [005](005-ai-cancel-register-after-validation.md) | Register AI cancellation after validation | P1 | S | — | REJECTED (wontfix; cancel-token leak on failed start not product-critical — KAR-139/#370) |
| 5 | [006](006-characterization-tests-paths-and-writes.md) | Characterize path and note-write invariants | P1 | M | — | REJECTED (characterization only for containment track we won't do — KAR-140/#371) |
| 6 | [008](008-flush-note-autosave-before-close.md) | Flush note autosave before close | P1 | M | — | REJECTED (wontfix; slam-close <900ms race not real usage — KAR-142/#373) |
| 7 | [010](010-report-index-failures-after-write.md) | Report index failures after note writes | P1 | S | — | REJECTED (wontfix; derived-index observability polish not product-critical — KAR-138/#369) |
| 8 | [012](012-ai-terminal-events-by-job-id.md) | Buffer AI terminal events by job id | P1 | S | — | REJECTED (wontfix; pre-start cross-job event overwrite not real usage — KAR-139/#370) |
| 9 | [016](016-revalidate-ai-http-redirects.md) | Revalidate every AI HTTP redirect | P1 | M | — | TODO |
| 10 | [007](007-amp-respect-assistant-mode.md) | Make Amp respect assistant mode | P1 | M | — | REJECTED (`--dangerously-allow-all` is by design for headless Amp `--execute`; Amp default is already allow-without-approval; Chat/Create tool gating needs SDK/plugin, not flag removal — KAR-141/#372) |
| 11 | [009](009-symlink-safe-space-containment.md) | Enforce symlink-safe space containment | P1 | L | 006 | REJECTED (space is not a sandbox; symlink containment declined — KAR-143/#374) |
| 12 | [011](011-serialize-database-cell-updates.md) | Serialize database cell note updates | P1 | M | — (003 rejected; decide write primitives in 011) | TODO |
| 13 | [013](013-batch-folder-preview-reads.md) | Batch visible folder preview reads | P2 | S | — | DONE |
| 14 | [014](014-stop-full-tag-reload-on-autosave.md) | Stop full tag reloads on autosave | P2 | M | — | DONE |
| 15 | [017](017-owner-only-ai-secret-file-perms.md) | Restrict plaintext AI secret file permissions | P2 | S | — | REJECTED (interim 0o600 floor without Keychain pull not justified — KAR-137/#368) |
| 16 | [018](018-clippy-and-cargo-locked-ci.md) | Add locked Rust and Clippy CI gates | P2 | S | — | TODO |
| 17 | [015](015-docs-and-dx-hygiene.md) | Correct documentation and DX drift | P2 | S | — | TODO |
| 18 | [019](019-database-sql-filter-sort-pagination.md) | Push database filtering and paging into SQLite | P2 | L | profiling step in plan | REJECTED (SQL pushdown overengineering / no-go — KAR-149/#380, KAR-150/#381) |
| 19 | [020](020-deeplink-v1-implementation.md) | Ship the locked v1 deeplink routes | P2 | L | — | REJECTED (reaffirm deeplink abandonment — #287; KAR-151/#382, KAR-152/#383) |
| 20 | [021](021-git-history-restore-version.md) | Restore a note from Git history safely | P2 | M | — | REJECTED (wontfix; note app, not Git client — restore via terminal; keep history read-only — #384) |
| 21 | [022](022-keychain-ai-credentials.md) | Move AI credentials to macOS Keychain | P3 | M–L | 017 | REJECTED (Keychain migration not planned — KAR-154/#385, KAR-155/#386) |
| 22 | [023](023-ai-read-only-vs-mutation-tools.md) | Separate read-only and mutation AI tools | P3 | M–L | — | REJECTED (keep binary tools; no read-only middle level — KAR-156/#387, KAR-157/#388) |
| 23 | [001](001-dependency-upgrade-roadmap.md) | Continue dependency upgrades in controlled waves | P1 | L | critical bug/security plans first | TODO |

Plan 001 is a multi-wave roadmap: Waves 1, 2, 3, and 6 have landed, while its
remaining independent waves are still TODO. Its row stays TODO until the
roadmap's remaining accepted waves are completed or explicitly retired.

### Linear housekeeping (2026-07-18)

- KAR-158..161 were canceled as thin duplicates of KAR-120 / KAR-121 / KAR-126 /
  KAR-125; plan 001 wave work continues on those canonical tickets — do not
  treat the duplicate cancels as rejecting plan 001.
- KAR-131 (`rusqlite`) was canceled earlier; plan 001 Wave 10 still lists the
  rusqlite migration as TODO unless/until the roadmap retires that wave
  explicitly.

## Dependency notes

- **006 before 009**: retired / moot — both ends REJECTED (containment track
  declined; characterization only existed to support it).
- **003 before 011 if sharing write primitives**: retired / moot — plan 003
  REJECTED (concurrent staging-temp race not real usage). Decide any write-
  primitive needs for database cell serialization inside plan 011 / #375 on
  their own merits; do not treat closed #369 as a hard blocker.
- **017 before 022**: retired / moot — both ends REJECTED (no interim 0o600
  floor; Keychain hard cutover not planned).
- **001 waves run independently after critical bug/security plans**: do not
  bundle formatter, compiler, Tauri, database, watcher, or AI migrations.
- **019 profiling / SQL pushdown**: retired / moot — plan REJECTED as
  overengineering; do not run the EXPLAIN gate or implement pushdown.
- Plan 001's TypeScript 7 step follows its TypeScript 6 bridge; Marked 18 stays
  blocked while TipTap Markdown requires `marked ^17`.
- `serde_yaml` replacement still has a hard-cutover decision gate requiring
  explicit maintainer approval. Plans 022/023 decision gates are moot
  (REJECTED).

## Findings considered and rejected

- **AI job lifecycle race-safety (plans 005+012 / #370 / KAR-139)**: rejected /
  wontfix. Cancel-token registration before failed preflight and single-slot
  pre-start terminal buffering are audit edge cases. Successful streams already
  register → spawn → finish and filter by `job_id` after start; same-hook sends
  stop the prior job. Real usage is single-active-job AI, not cancel-map leaks
  on validation failure or cross-job overwrites during the short start IPC
  window.
- **Filesystem durability / index reconciliation (plans 003+004+010 / #369 /
  KAR-138)**: rejected / wontfix. Audit-driven edge hardenings (same-ms
  atomic temp collisions, Trash-before-deindex ordering, index-failure
  observability after a successful write) are not product-critical for a
  single-user desktop notes app with sequential edits. Real usage does not look
  like concurrent staging races or silent index-suppress windows; Markdown on
  disk remains source of truth and existing reindex paths can recover derived
  state.
- **Strip Git remote credentials (plan 002 / #368 / KAR-137)**: rejected.
  Threat model mismatch for a single-user desktop app; local credential hygiene
  on persisted remotes is not a product priority.
- **Path/write characterization tests (plan 006 / #371 / KAR-140)**: rejected.
  Tests existed only to de-risk the symlink-containment track we will not do.
- **Amp Chat/Create tool policy via dropping `--dangerously-allow-all`
  (plan 007 / #372 / KAR-141)**: rejected. The flag is intentional for
  headless Amp `--execute` + `--stream-json`; Amp’s product default is already
  allow-without-approval when permissions are unset, so omitting the flag is
  not tool disabling. Amp `--mode` is agent intensity, not Glyph Chat/Create.
  Enforceable mode policy needs a separate Amp SDK/policy-plugin design.
- **Flush note autosave before close (plan 008 / #373 / KAR-142)**: rejected /
  wontfix. The slam-close <900ms race is not real usage.
- **Symlink-safe space containment (plan 009 / #374 / KAR-143)**: rejected. A
  Glyph space is not a sandbox; symlink containment is declined.
- **Owner-only AI secret file permissions (plan 017 / #368 / KAR-137)**:
  rejected. An interim `0o600` floor without a Keychain migration is not
  justified.
- **Database SQL filter/sort/pagination (plan 019 / #380+#381 / KAR-149+KAR-150)**:
  rejected as overengineering / no-go.
- **Deeplink v1 implementation (plan 020 / #382+#383 / KAR-151+KAR-152)**:
  rejected; reaffirms deeplink abandonment (#287).
- **Git history restore (plan 021 / #384)**: rejected / wontfix. Glyph is a
  note app, not a Git client. Read-only history (list + diff) stays; in-app
  restore is out of product scope. Users who need an older blob can recover it
  from the terminal with ordinary Git.
- **Keychain AI credentials (plan 022 / #385+#386 / KAR-154+KAR-155)**: rejected;
  Keychain migration is not planned.
- **Read-only vs mutation AI tools (plan 023 / #387+#388 / KAR-156+KAR-157)**:
  rejected. Keep binary tools; no read-only middle permission level.
- **Bulk dependency upgrade**: rejected because it mixes editor, bundler,
  formatter, compiler, database, filesystem, Tauri, and AI runtime migrations
  into an unreviewable change.
- **Marked 18 now**: deferred because TipTap Markdown 3.27.4 still requires
  `marked ^17.0.1`; shipping two parser majors risks divergent behavior.
- **Vite 7 / CodSpeed blocker**: obsolete. PR #361 removed CodSpeed and landed
  Vite `^8.1.4`; do not re-plan the old peer conflict.
- **Soft-DRM signed licenses**: deferred unless the maintainer explicitly asks
  for it; current licensing work does not justify the added signing and
  recovery surface.
- **Collapse one-line tab IDs**: rejected as too little value for the churn and
  navigation-state risk.
- **MainContent registry**: rejected as premature; the current finite view set
  does not justify a new registry abstraction.
