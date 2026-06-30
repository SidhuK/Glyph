# Glyph

<p align="center">
  <img src="logo_g.PNG" alt="Glyph logo" width="140" />
</p>

<p align="center">
  <a href="https://app.codspeed.io/SidhuK/Glyph?utm_source=badge"><img src="https://img.shields.io/endpoint?url=https://codspeed.io/badge.json" alt="CodSpeed"/></a>
</p>

<p align="center">
  <strong>Join the Glyph community</strong><br />
  Share feedback, ask questions, and help shape what comes next.
</p>

<p align="center">
  <a href="https://discord.gg/cNqrBfFx7D"><strong>Join us on Discord →</strong></a>
</p>

Offline-first desktop note-taking application. Tauri 2 shell with a React 19 / TypeScript / Vite 8 frontend and a Rust backend. Data lives entirely on-disk in a per-space `.glyph/` directory backed by SQLite and the local filesystem. No cloud sync, no server.

![Glyph](imageforWebsite.png)

## Prerequisites

| Dependency | Version                                                   |
| ---------- | --------------------------------------------------------- |
| Node.js    | ≥ 20                                                      |
| pnpm       | ≥ 10 (`corepack enable && corepack prepare pnpm@10.28.2`) |
| Rust       | stable (latest)                                           |
| Xcode CLT  | required for macOS native compilation                     |
| macOS      | primary target — full Tauri app dev requires macOS        |

## Build & Run

```bash
# Install frontend dependencies
pnpm install

# Development — frontend only (Vite on :1420)
pnpm dev

# Development — full Tauri app (compiles Rust backend + launches Vite)
pnpm tauri dev

# Production build (tsc + vite build; Tauri hooks run beforeBuildCommand)
pnpm build

# Lint & format (Biome)
pnpm check          # check only
pnpm format         # auto-fix

# Tests (Vitest)
pnpm test                              # all tests
pnpm test -- src/lib/diff.test.ts      # single file
pnpm test -- -t "test name"            # single test by name

# Rust checks
cd src-tauri && cargo check            # typecheck
cd src-tauri && cargo clippy           # lint

```

### Pre-push checklist

```bash
pnpm check && pnpm build && cd src-tauri && cargo check
```

## Key dependencies

**Frontend:** React 19, TipTap 3, Tailwind 4, Radix UI (via shadcn/ui), Motion 12, TanStack Table, cmdk, Zod 4, date-fns, Mermaid 11, highlight.js/lowlight, react-resizable-panels, Sonner, react-hook-form

**Backend:** Tauri 2 (`macos-private-api`), rig-core 0.24, rusqlite 0.31 (bundled), notify 6, reqwest 0.12 (rustls), tokio, serde/serde_json/serde_yaml, chrono, uuid, sha2, window-vibrancy, core-text (macOS)

**Tooling:** Vite 8, TypeScript 5.8, Biome, Vitest 4, Tauri CLI 2

## Conventions

- TypeScript strict mode. No `any` — use `unknown` + narrowing.
- Functional React components only. State via Context, not prop drilling.
- All Tauri IPC through `invoke()` from `src/lib/tauri.ts`.
- Rust: atomic writes via `io_atomic`, safe paths via `paths::join_under()`, SSRF checks via `net.rs`.
- Hard cutover migrations — no backward-compatibility shims.
- Never log secrets, keys, or sensitive user data.
- ~200 LOC per file guideline; refactor into submodules when exceeded.

## Licensing

Source is open. Official release binaries include a 7-day trial with Gumroad license activation.

- Releases: [GitHub Releases](https://github.com/SidhuK/Glyph/releases)
- Purchase: [Gumroad](https://karatsidhu.gumroad.com/l/sqxfay)
- Details: [`docs/licensing.md`](docs/licensing.md)

## Platform support

macOS only. Windows and Linux are not actively supported. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
