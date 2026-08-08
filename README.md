# Glyph

<p align="center">
  <img src="logo_g.PNG" alt="Glyph logo" width="140" />
</p>

<p align="center">
  <img alt="GitHub downloads" src="https://img.shields.io/github/downloads/SidhuK/Glyph/total" />
</p>

<p align="center">
  <strong>Offline-first notes for macOS</strong><br />
  Keep your Markdown files close, search them quickly, and work without a server.
</p>

<p align="center">
  <a href="https://github.com/SidhuK/Glyph/actions/workflows/pr-checks.yml">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/ci/SidhuK/Glyph.svg?workflow=PR%20Checks&amp;branch=main&amp;variant=secondary&amp;theme=slate&amp;mode=dark" />
      <img alt="CI status" src="https://shieldcn.dev/github/ci/SidhuK/Glyph.svg?workflow=PR%20Checks&amp;branch=main&amp;variant=secondary&amp;theme=slate&amp;mode=light" />
    </picture>
  </a>
  <a href="https://github.com/SidhuK/Glyph/releases">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/release/SidhuK/Glyph.svg?variant=secondary&amp;theme=slate&amp;mode=dark" />
      <img alt="Latest release" src="https://shieldcn.dev/github/release/SidhuK/Glyph.svg?variant=secondary&amp;theme=slate&amp;mode=light" />
    </picture>
  </a>
  <a href="https://github.com/SidhuK/Glyph/blob/main/LICENSE">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/license/SidhuK/Glyph.svg?variant=secondary&amp;theme=slate&amp;mode=dark" />
      <img alt="License" src="https://shieldcn.dev/github/license/SidhuK/Glyph.svg?variant=secondary&amp;theme=slate&amp;mode=light" />
    </picture>
  </a>
  <a href="https://github.com/SidhuK/Glyph/stargazers">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/stars/SidhuK/Glyph.svg?variant=secondary&amp;theme=slate&amp;mode=dark" />
      <img alt="GitHub stars" src="https://shieldcn.dev/github/stars/SidhuK/Glyph.svg?variant=secondary&amp;theme=slate&amp;mode=light" />
    </picture>
  </a>
  <a href="https://github.com/SidhuK/Glyph/commits/main">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/last-commit/SidhuK/Glyph.svg?variant=secondary&amp;theme=slate&amp;mode=dark" />
      <img alt="Last commit" src="https://shieldcn.dev/github/last-commit/SidhuK/Glyph.svg?variant=secondary&amp;theme=slate&amp;mode=light" />
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://discord.gg/cNqrBfFx7D"><strong>Join the Glyph community →</strong></a>
</p>

Glyph is an offline-first desktop note-taking application. It combines a Tauri 2 shell with a React 19 / TypeScript / Vite 8 frontend and a Rust backend. Notes live on disk as Markdown files with per-space metadata in a `.glyph/` directory; a derived SQLite search index lives in app support and rebuilds from the notes. No cloud sync. No server.

![Glyph](imageforWebsite.png)

## Highlights

- **Markdown files first** — your notes remain readable, portable files on disk.
- **Local search** — a derived SQLite index keeps navigation fast without sending notes anywhere.
- **Focused desktop workspace** — a macOS-first Tauri app with a rich editor, spaces, tasks, databases, and optional AI tools.

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

## Built with

- **Frontend:** React 19, TipTap 3, TypeScript, Vite 8, Tailwind 4, Radix UI (via shadcn/ui), Motion 12, TanStack Table, cmdk, Zod 4, date-fns, Mermaid 11, highlight.js/lowlight, react-resizable-panels, Sonner, react-hook-form

- **Backend:** Tauri 2 (`macos-private-api`), Rust, rig-core 0.24, rusqlite 0.31 (bundled), notify 6, reqwest 0.12 (rustls), tokio, serde/serde_json/serde_yaml, chrono, uuid, sha2, window-vibrancy, core-text (macOS)

- **Tooling:** Biome, Vitest 4, Tauri CLI 2, pnpm 10

## Conventions

- TypeScript strict mode. No `any` — use `unknown` + narrowing.
- Functional React components only. State via Context, not prop drilling.
- All Tauri IPC through `invoke()` from `src/lib/tauri.ts`.
- Rust: atomic writes via `io_atomic`, safe paths via `paths::join_under()`, SSRF checks via `net.rs`.
- Hard cutover migrations — no backward-compatibility shims.
- Never log secrets, keys, or sensitive user data.
- ~200 LOC per file guideline; refactor into submodules when exceeded.

## Licensing

Glyph's source is available under the [GNU Affero General Public License v3.0](LICENSE). Official release binaries include a 7-day trial with Gumroad license activation.

- Releases: [GitHub Releases](https://github.com/SidhuK/Glyph/releases)
- Purchase: [Gumroad](https://karatsidhu.gumroad.com/l/sqxfay)

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, project conventions, and pull request guidance.

## Platform support

macOS only. Windows and Linux are not actively supported. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
