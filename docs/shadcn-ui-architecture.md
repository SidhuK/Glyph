# ShadCN UI Architecture Notes

## Migration Completion Snapshot (2026-02-09)

- Foundations are in place: ShadCN setup, theme bridge, and base layer are active.
- Major shell controls are migrated to ShadCN patterns (notably command palette and sidebar mode controls).
- Migration is not fully complete yet:
  - Legacy `iconBtn` is still active in live paths (`src/components/canvas/CanvasNoteOverlayEditor.tsx`, `src/components/ui/MotionButton.tsx`).
  - Legacy app stylesheet imports are still present in `src/App.css`.
- Completion bookkeeping in `ShadC_implementation_plan.md` is authoritative and must match repository reality.

## Layering Model

1. Design tokens remain the source of truth in `src/design-tokens.css`.
2. ShadCN semantic bridge maps those tokens in `src/styles/shadcn-theme.css`.
3. ShadCN base primitives load in `src/styles/shadcn-base.css`.
4. Legacy app styles remain in `src/styles/app/*.css` only for behavior-critical or not-yet-migrated screens.
5. Current load order in `src/App.css` must keep ShadCN layers before legacy app files:
   - `src/styles/shadcn-theme.css`
   - `src/styles/shadcn-base.css`
6. New UI work should prefer `src/components/ui/shadcn/*` primitives and avoid adding new legacy selectors.

## State and Behavior Rules

- Preserve context flow through `VaultContext`, `FileTreeContext`, `ViewContext`, and `UIContext`.
- Keep Tauri drag regions explicit:
  - `data-tauri-drag-region` on chrome-only zones
  - `data-window-drag-ignore` on interactive containers
- Keep typed IPC access through `src/lib/tauri.ts`.

## Migration Conventions

- New controls should default to ShadCN primitives and variants.
- Remove legacy selectors only when call sites are fully retired in the same change.
- Preserve required globals/resets/tokens while retiring component-level legacy selectors.
- Motion should stay intentional; prefer tokenized duration/easing values from `src/styles/shadcn-theme.css`.
- Respect `prefers-reduced-motion` in all new interactions.

## Final Guidance for Remaining Work

- Keep retiring legacy selectors in small, evidence-based passes:
  - check call sites with `rg -n "iconBtn|segBtn" src`.
  - remove only selectors with zero live call sites.
- Do not retire global or foundational layers yet:
  - keep resets, token definitions, and shared shell invariants until replacement is verified.
- Before marking Phase 10 `done`, verify:
  - no live `.iconBtn` or `.segBtn` references in production code.
  - `src/App.css` imports are reduced to required base + non-migrated exceptions only.
  - `pnpm check` and `pnpm build` pass on the migration branch.
