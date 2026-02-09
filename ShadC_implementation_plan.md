# ShadC Implementation Plan

## Objective
Migrate Lattice’s entire frontend UI to a ShadCN-first component architecture and ship it as a full-app cutover in one release, preserving existing behavior (Tauri drag regions, offline-first data flow, typed IPC) while delivering a more polished, breathable, professional interface.

## Release Model (Non-Incremental)
- This migration is **not incremental for end users**.
- All phases below are internal execution workstreams only.
- User-facing rollout is a single full-app release where shell, sidebar, settings, AI, command layer, and canvas-adjacent controls are all migrated together.
- No mixed “old UI + new UI” release to production.

## Skills Used
- `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/SKILL.md`) for UX quality priorities and design-system-first workflow.
- `design-system-patterns` (`.agents/skills/design-system-patterns/SKILL.md`) for token hierarchy, theming strategy, and component architecture.
- `frontend-design` (`.agents/skills/frontend-design/SKILL.md`) for visual direction and polish standards.

Note: `ui-ux-pro-max` script/data folders are empty in this repo, so this plan uses its documented workflow principles manually.

## Current-State Audit (Codebase-Specific)
- Styling is centralized in `src/App.css`, which imports 34 app CSS files (`src/styles/app/*.css`) totaling ~5900 LOC.
- There is an existing token layer in `src/design-tokens.css` with primitive + semantic CSS variables.
- UI primitives are custom and class-driven (`iconBtn`, `segBtn`, settings styles, etc.) with Motion wrappers in `src/components/ui/`.
- No Tailwind, no `components.json`, and no existing ShadCN scaffold currently present.
- Core shell interaction complexity is high in:
  - `src/components/app/AppShell.tsx`
  - `src/components/app/Sidebar.tsx`
  - `src/components/app/SidebarContent.tsx`
  - `src/components/app/CommandPalette.tsx`
  - `src/components/ai/AIPane.tsx`
  - `src/SettingsApp.tsx`
- Tauri drag behavior is explicitly encoded with `data-tauri-drag-region`, `data-window-drag-ignore`, and `onWindowDragMouseDown` across the shell/settings/AI panes.

## Design Direction (Polished, Non-Generic)
- Keep Lattice’s content-focused, calm visual language, but increase hierarchy clarity and spacing rhythm.
- Move from ad-hoc class styling to semantic component variants (Button, Card, Input, Tabs, etc.).
- Keep motion intentional and minimal:
  - Use Motion for key transitions (sidebar, panel mount, command palette).
  - Use CSS/Tailwind transitions for micro-interactions.
- Accessibility targets:
  - 4.5:1 text contrast minimum.
  - 44px target size for primary controls.
  - Visible focus rings on all interactive elements.

## ShadCN Integration Strategy (From Official Docs)
Use the official Vite + React setup path and complete ShadCN adoption across the app before release:
- Initialize with CLI (`pnpm dlx shadcn@latest init`).
- Add all required components during migration (`pnpm dlx shadcn@latest add <component>`).
- Configure `components.json` (style, css variables, aliases) and local utility (`cn`) model compatible with ShadCN patterns.
- Adopt dark mode via `next-themes` and class strategy where needed.

## Complete ShadCN Component Inventory (App-Wide)
The following components should be considered in-scope for the full cutover and added as needed:
- Core primitives: `button`, `input`, `textarea`, `label`, `badge`, `separator`, `skeleton`.
- Form and field patterns: `form`, `checkbox`, `radio-group`, `switch`, `slider`, `select`.
- Navigation and structure: `tabs`, `sidebar`, `scroll-area`, `resizable`, `breadcrumb`, `collapsible`.
- Overlay and command: `dialog`, `alert-dialog`, `sheet`, `popover`, `dropdown-menu`, `context-menu`, `command`, `tooltip`, `hover-card`.
- Data and feedback: `table`, `progress`, `alert`, `avatar`.
- Notification: `sonner` (or ShadCN toast pattern) for consistent app feedback.

If a component above is not directly used, we still align equivalent custom behavior to ShadCN patterns and tokens.

## Internal Workstream Plan (Single-Cutover Release)

### Migration Status Tracker

| Phase | Status | Notes |
|---|---|---|
| Phase 0 | done | Baseline/audit captured in this plan and branch workflow documented. |
| Phase 1 | done | Tailwind + ShadCN foundation added (`components.json`, aliases, utility stack). |
| Phase 2 | done | Token bridge added via `src/styles/shadcn-theme.css` and `src/styles/shadcn-base.css`. |
| Phase 3 | done | Core reusable controls are migrated to ShadCN primitives on high-traffic surfaces; remaining legacy button classes are isolated to non-migrated paths. |
| Phase 4 | done | Command palette moved to ShadCN `Dialog` + `Command` primitives. |
| Phase 5 | done | Sidebar mode controls are on ShadCN `Tabs`, and list panes are wrapped in `ScrollArea` while preserving existing context flow. |
| Phase 6 | in progress | Settings shell migration ongoing; deep form-field standardization still being completed. |
| Phase 7 | in progress | AI surfaces migration ongoing; data flow untouched, visual primitives converging. |
| Phase 8 | in progress | Canvas-adjacent toolbar controls migrated to ShadCN button variants. |
| Phase 9 | in progress | Motion tokens/reduced-motion guardrails introduced; final pass pending. |
| Phase 10 | in progress | Dead `segBtn` selector paths removed from owned CSS; `iconBtn` remains in live canvas/motion paths, and full import-layer retirement is still pending. |

### Completion Bookkeeping Snapshot (2026-02-09)
- Tracker reflects current repository evidence and is intentionally not marked fully done.
- Phase 9 remains `in progress` because motion tokens and reduced-motion guardrails exist, but duration/easing values are not fully normalized across all motion surfaces.
- Phase 10 remains `in progress` because legacy class usage still exists in production paths (`iconBtn` in `src/components/canvas/CanvasNoteOverlayEditor.tsx` and `src/components/ui/MotionButton.tsx`), and `src/App.css` still imports the full legacy app stylesheet set.
- Phases should only be moved to `done` when corresponding code paths and style layers are fully migrated in-repo.

### Phase 0: Baseline and Guardrails
Scope: No visual changes yet.

Tasks:
1. Capture UI baseline screenshots for:
   - App shell with open vault.
   - Sidebar each mode (Files/Tags/Canvases).
   - AI sidebar/pane and tool indicator states.
   - Command palette.
   - Settings tabs.
2. Identify hotspots by CSS size + component complexity:
   - `05-main-area.css`, `07-ai-panel.css`, `20-canvas-ui.css`, `12-editor-shell.css`.
3. Add migration tracking doc section in this file:
   - status per phase (`not started`, `in progress`, `done`).
4. Define rollback rule:
   - every phase lands as an isolated PR/commit boundary with a reversible scope.
5. Define cutover branch policy:
   - no release branch merge until all migration phases are complete.

Acceptance criteria:
- Baseline captured.
- No user-visible behavior changed.

### Phase 1: Foundation (Tailwind + ShadCN Bootstrapping)
Scope: Install infrastructure without replacing existing screens.

Tasks:
1. Add Tailwind and ShadCN prerequisites (Vite path).
2. Initialize ShadCN:
   - create `components.json`
   - set aliases (`components`, `utils`, etc.)
3. Add standard utility stack used by ShadCN components:
   - `clsx`, `tailwind-merge`, and `cn` util.
4. Configure path aliases in:
   - `tsconfig.json`
   - `vite.config.ts`
5. Create `src/components/ui/shadcn/` target location for generated components (or standard `src/components/ui/` with naming convention).
6. Add a migration-safe root stylesheet order:
   - keep existing `App.css` imports
   - add Tailwind layers without disrupting legacy selectors.

Acceptance criteria:
- App builds and runs unchanged.
- ShadCN CLI can add all baseline components successfully.
- No regressions in Tauri window behavior.

### Phase 2: Token Bridge (Design System Convergence)
Scope: Map existing tokens into ShadCN semantic token contract.

Tasks:
1. Create token bridge file (e.g. `src/styles/shadcn-theme.css`) mapping:
   - `--background`, `--foreground`, `--card`, `--muted`, `--accent`, `--border`, `--ring`, etc.
   - from current `src/design-tokens.css` variables.
2. Keep existing Lattice semantic palette as source-of-truth initially.
3. Add radius + spacing harmonization so ShadCN components visually match current UI.
4. Add dark-theme class strategy (not media-only), while preserving existing behavior.
5. Introduce motion tokens for consistent durations/easing.

Acceptance criteria:
- Existing screens unchanged or visually equivalent.
- New ShadCN primitives inherit Lattice theme automatically in both light/dark.

### Phase 3: Primitive Control Migration (Low-Risk Surface Area)
Scope: Replace reusable controls first, without restructuring major layouts.

Components to adopt:
- `button`, `input`, `textarea`, `label`, `badge`, `separator`, `tooltip`, `skeleton`, `switch`, `slider`, `select`, `checkbox`, `radio-group`, `form`.

Tasks:
1. Create adapter primitives:
   - `AppButton` wrapping ShadCN `Button` + optional Motion.
   - `AppIconButton` replacing `.iconBtn` usage.
   - `AppSegmentedControl` replacing `.segBtn` groups.
2. Update high-reuse entry points:
   - `src/components/app/SidebarHeader.tsx`
   - `src/components/app/MainToolbar.tsx`
   - `src/components/canvas/CanvasToolbar.tsx`
   - `src/components/settings/*` control rows
3. Preserve keyboard/mouse semantics and title/aria labels.
4. Keep legacy class names temporarily where mixed styling is unavoidable.

Acceptance criteria:
- `iconBtn`/`segBtn` usage reduced substantially.
- All replaced controls pass focus-visible and disabled-state checks.

### Phase 4: Overlay and Command Layer
Scope: Upgrade modal/overlay UX and command interactions.

Components to adopt:
- `dialog`, `alert-dialog`, `sheet`, `popover`, `dropdown-menu`, `context-menu`, `hover-card`, `command`, `scroll-area`.

Tasks:
1. Migrate `src/components/app/CommandPalette.tsx` to:
   - ShadCN `Dialog` + `Command`.
   - preserve keyboard nav + selection behavior.
2. Convert secondary floating menus/panels to `Popover`/`DropdownMenu`.
3. Ensure body locking/focus trap works inside Tauri.
4. Keep portal containers stable for desktop app constraints.

Acceptance criteria:
- Command palette parity with current shortcuts/arrow nav/enter behavior.
- Better focus management than native `<dialog>` implementation.

### Phase 5: Sidebar Architecture Migration (Core Shell)
Scope: Move left nav to ShadCN sidebar patterns without breaking context logic.

Components to adopt:
- `sidebar`, `tabs` or `toggle-group`, `collapsible`, `scroll-area`, `context-menu`.

Targets:
- `src/components/app/Sidebar.tsx`
- `src/components/app/SidebarContent.tsx`
- `src/components/app/SidebarHeader.tsx`
- `src/styles/app/04-sidebar.css`
- `src/styles/app/17-filetree-head.css`
- `src/styles/app/18-filetree-body.css`

Tasks:
1. Introduce `SidebarProvider` with controlled state from `UIContext`.
2. Keep existing modes (files/tags/canvases) as logical tabs.
3. Wrap tree lists in `ScrollArea`.
4. Replace footer/settings row with ShadCN button variants.
5. Preserve collapse behavior and animation.
6. Preserve drag-region behavior by explicitly applying:
   - `data-tauri-drag-region` only on non-interactive chrome.
   - `data-window-drag-ignore` on interactive content containers.

Acceptance criteria:
- Sidebar mode switching, selection, and open/close behavior unchanged.
- No drag-region regressions.

### Phase 6: Settings Window Migration (Pilot Full Screen)
Scope: Fully modernize `SettingsApp` as a polished reference implementation included in the single cutover release.

Components to adopt:
- `tabs`, `card`, `form`, `input`, `textarea`, `select`, `switch`, `slider`, `checkbox`, `radio-group`, `badge`, `separator`, `tooltip`, `alert`.

Targets:
- `src/SettingsApp.tsx`
- `src/components/settings/**/*.tsx`
- `src/styles/app/09-settings-shell.css`
- `src/styles/app/10-settings-controls.css`
- `src/styles/app/11-settings-misc.css`

Tasks:
1. Replace custom nav buttons with `Tabs` + card composition.
2. Convert forms to consistent field scaffolding:
   - label/help/error alignment.
3. Migrate toggles/range controls to ShadCN patterns.
4. Improve status badges and system-state visibility.
5. Keep URL hash routing and tab deep-link behavior unchanged.

Acceptance criteria:
- Settings UI is fully ShadCN-driven and visually cohesive.
- Existing settings functionality remains unchanged.

### Phase 7: AI Surface Migration (Pane + Tooling UI)
Scope: Make AI interfaces professional and legible under heavy interaction.

Components to adopt:
- `card`, `accordion`, `badge`, `alert`, `progress`, `scroll-area`, `separator`, `button`, `textarea`, `select`, `tooltip`, `dropdown-menu`.

Targets:
- `src/components/ai/AIPane.tsx`
- `src/components/ai/AISidebar.tsx`
- `src/components/ai/ChatInput.tsx`
- `src/components/ai/ChatMessages.tsx`
- `src/components/ai/ToolIndicator.tsx`
- `src/components/ai/ToolIndicatorGroup.tsx`
- `src/components/ai/ToolIndicator.module.css`
- related AI CSS files (`07-ai-panel.css`, `08-ai-sidebar-context.css`, `14-ai-pane.css`, `15-chat-actions.css`, `16-ai-legacy.css`)

Tasks:
1. Convert ToolIndicator to structured status rows:
   - badge for phase (`running/success/error`)
   - collapsible payload panel using `Accordion`/`Collapsible`.
2. Improve chat density with spacing tiers:
   - system/meta/tool/user/assistant message visual hierarchy.
3. Standardize action rows (rewrite/apply/create note/card) with button variants.
4. Keep existing AI logic hooks untouched (`useAIChat`, `useAIActions`, etc.).

Acceptance criteria:
- AI panel has clearer visual hierarchy and better readability.
- Tool execution states are easier to scan at a glance.

### Phase 8: Canvas-Adjacent Controls (Selective)
Scope: Migrate canvas-adjacent chrome, not ReactFlow internals first.

Components to adopt:
- `button`, `tooltip`, `dropdown-menu`, `context-menu`, `separator`, `sheet`, `popover`, `alert-dialog`.

Targets:
- `src/components/canvas/CanvasToolbar.tsx`
- `src/components/canvas/CanvasNoteOverlayEditor.tsx`
- node controls where feasible without disrupting XYFlow node rendering.

Tasks:
1. Keep node rendering mechanics intact (high risk area).
2. Replace only toolbar/action controls first.
3. Defer deep node skinning until shell + settings + AI are stable.

Acceptance criteria:
- Canvas operations remain performant and behaviorally unchanged.

### Phase 9: Motion and Micro-Interaction Pass
Scope: Polish pass after functional migration.

Tasks:
1. Retain Motion where it adds value, remove ornamental animation.
2. Align durations/easing across shell, sidebar, dialogs, and lists.
3. Add reduced-motion handling consistently.
4. Tighten hover/focus/active states for consistency.

Acceptance criteria:
- Motion feels intentional, not noisy.
- Reduced-motion preference is respected.

### Phase 10: CSS Retirement and Cleanup
Scope: Remove dead legacy CSS and simplify maintenance.

Tasks:
1. Track class usage and remove obsolete selectors after each phase.
2. Shrink `src/App.css` imports as sections fully migrate.
3. Keep only:
   - global resets
   - token definitions
   - app-specific exceptions not covered by ShadCN.
4. Add UI architecture docs for future contributors.

Acceptance criteria:
- Legacy CSS footprint materially reduced.
- No dead style layers for migrated components.

## Component Migration Matrix

| Existing Pattern | Current Location | ShadCN Target | Migration Notes |
|---|---|---|---|
| `MotionIconButton` + `.iconBtn` | `src/components/ui/MotionButton.tsx` | `Button` (icon variants) | Keep optional Motion wrapper around ShadCN button |
| `segBtn` groups | `src/components/app/SidebarContent.tsx`, editor | `Tabs` / `ToggleGroup` | Use value-driven state from context |
| Native `<dialog>` command palette | `src/components/app/CommandPalette.tsx` | `Dialog` + `Command` | Better a11y and keyboard consistency |
| Sidebar custom structure | `src/components/app/Sidebar*.tsx` | `Sidebar` + `Collapsible` + `ScrollArea` | Preserve current file/tag/canvas context logic |
| Settings custom cards/fields | `src/components/settings/*` | `Card`, `Form`, `Label`, `Input`, `Switch`, `Slider`, `Select`, `Checkbox`, `RadioGroup`, `Tabs` | Highest visual ROI, lower data risk |
| AI tool indicator CSS module | `src/components/ai/ToolIndicator*.tsx` | `Accordion` + `Badge` + `Alert` | Keep phase semantics and payload toggling |
| App notifications and transient feedback | App-wide | `Sonner`/toast + `AlertDialog` | Replace ad-hoc alerts/confirms with consistent feedback UX |

## Behavior Preservation Checklist
- Tauri drag regions remain correct:
  - do not wrap interactive controls in draggable containers.
- Keyboard shortcuts:
  - Command palette (`⌘K`) behavior unchanged.
- Context state flow untouched:
  - `VaultContext`, `FileTreeContext`, `ViewContext`, `UIContext`.
- Typed IPC unchanged:
  - continue invoking through `src/lib/tauri.ts`.
- Offline-first invariants untouched:
  - no backend/storage behavior changes in this migration.

## Quality Gates (Workstream + Final Cutover)
After each workstream run:
1. `pnpm check`
2. `pnpm build`
3. Manual Tauri smoke checks (`pnpm tauri dev`) for:
   - opening/creating vaults
   - sidebar navigation
   - canvas open/edit
   - AI panel interactions
   - settings navigation

Recommended additional checks:
1. Keyboard-only navigation sweep.
2. Contrast/focus audit on migrated screens.
3. Visual regression screenshots for migrated components.
4. Pre-release full-app regression sweep on the final cutover branch.

## Risk Register
- Tailwind + legacy CSS collision.
  - Mitigation: strict layering order, migrate by component not by blanket rewrite.
- Drag-region regressions in desktop window chrome.
  - Mitigation: explicit drag/no-drag utility wrappers and manual smoke test checklist.
- Over-animation or inconsistent interaction states.
  - Mitigation: central motion presets and reduced-motion guardrails.
- Scope creep into canvas internals.
  - Mitigation: defer deep node visual refactor until shell/settings/AI stabilization.

## Suggested Delivery Sequence
1. Execute Phase 0-2 (foundation + token bridge) on a cutover branch.
2. Complete Phase 3-8 in parallelized workstreams where possible.
3. Run Phase 9-10 only after all feature surfaces are migrated.
4. Perform one integrated QA pass and release once.

This sequence keeps implementation organized but preserves the single non-incremental release model.

## Definition of Done
- ShadCN component architecture is the default for shell, sidebar, settings, AI, command surfaces, and canvas-adjacent controls.
- Legacy UI classes (`iconBtn`, `segBtn`, etc.) are removed from production paths.
- UI is visibly more polished and consistent, with improved accessibility and interaction quality.
- No regressions in core vault/canvas/AI workflows.
- Entire migration ships in one release with no mixed legacy/ShadCN production state.

## References (Official Docs)
- ShadCN Vite install docs: https://ui.shadcn.com/docs/installation/vite
- ShadCN CLI docs: https://ui.shadcn.com/docs/cli
- `components.json` schema/config: https://ui.shadcn.com/docs/components-json
- Sidebar component docs: https://ui.shadcn.com/docs/components/sidebar
- Command component docs: https://ui.shadcn.com/docs/components/command
- Dialog component docs: https://ui.shadcn.com/docs/components/dialog
- Form component docs: https://ui.shadcn.com/docs/components/form
- Dropdown menu docs: https://ui.shadcn.com/docs/components/dropdown-menu
- Context menu docs: https://ui.shadcn.com/docs/components/context-menu
- Scroll area docs: https://ui.shadcn.com/docs/components/scroll-area
- Resizable docs: https://ui.shadcn.com/docs/components/resizable
- Sonner docs: https://ui.shadcn.com/docs/components/sonner
- Dark mode (Vite): https://ui.shadcn.com/docs/dark-mode/vite
- ShadCN changelog (for latest API shifts): https://ui.shadcn.com/docs/changelog
