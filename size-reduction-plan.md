# Glyph Binary Size Reduction Plan

> **Current state**: 33 MB `.app` bundle (26 MB Rust binary + 6.6 MB embedded frontend + 1.1 MB icon)
>
> **Goal**: Reduce total `.app` size as much as possible without impacting functionality or performance.

---

## How the 33 MB breaks down

The Tauri 2 bundler produces a `.app` with this structure:

```
Glyph.app/Contents/
├── MacOS/glyph          26 MB   ← Rust binary (includes embedded frontend)
├── Resources/icon.icns   1.1 MB ← App icon
└── Info.plist             4 KB
```

The 26 MB Rust binary's Mach-O segments:

| Segment | Size | % | What it is |
|---------|------|---|------------|
| `__text` | 14.61 MB | 58.8% | Compiled Rust/C machine code from 403 unique crates |
| `__const` | 6.53 MB | 26.3% | Read-only data — mostly the 6.6 MB embedded `dist/` frontend |
| `__eh_frame` | 2.05 MB | 8.2% | DWARF exception unwinding tables |
| `__gcc_except_tab` | 1.06 MB | 4.3% | C++ exception handling tables (from C deps like SQLite) |
| `__unwind_info` | 0.38 MB | 1.5% | Compact unwind info for stack unwinding |
| `__cstring` | 0.22 MB | 0.9% | C string literals |
| Other | ~0.15 MB | ~0.3% | Stubs, GOT, ObjC metadata |

---

## Phase 1: Release Profile Optimization (zero-risk, ~5–8 MB savings)

### 1A. Add release profile to `src-tauri/Cargo.toml`

**Problem**: There is currently **no `[profile.release]`** section at all. The binary is compiled with Rust defaults: no stripping, no LTO, 16 codegen units, and full unwinding support. This means 3.49 MB of unwinding metadata (`__eh_frame` + `__gcc_except_tab` + `__unwind_info`) is included, debug symbols are retained, and code isn't optimized for size.

**What to add** at the bottom of `src-tauri/Cargo.toml`:

```toml
[profile.release]
strip = "symbols"        # Remove all symbol tables and debug info
lto = "thin"             # Link-Time Optimization — deduplicates code across crates
codegen-units = 1        # Single codegen unit — better optimization, slower compile
panic = "abort"          # No unwinding — eliminates __eh_frame, __gcc_except_tab, __unwind_info
opt-level = "s"          # Optimize for size instead of speed (minimal perf impact)
```

**What each setting does**:

- **`strip = "symbols"`**: Removes the `__LINKEDIT` segment's symbol tables (~764 KB) and any remaining debug info. The 418 symbols currently in the binary would be removed.
- **`lto = "thin"`**: Performs cross-crate dead code elimination. When 403 crates are compiled separately, many unused functions from library crates survive in the binary. Thin LTO identifies and removes them with reasonable compile times. Full `lto = true` would save slightly more but dramatically increases compile times.
- **`codegen-units = 1`**: Forces all code through a single LLVM optimization pass, enabling better inlining decisions and dead code elimination. Default is 16, which parallelizes compilation but prevents cross-unit optimization.
- **`panic = "abort"`**: Eliminates the entire unwinding infrastructure. Currently, every function that could panic has associated entries in `__eh_frame` (2.05 MB), `__gcc_except_tab` (1.06 MB), and `__unwind_info` (0.38 MB). With `abort`, panics immediately terminate the process — no stack unwinding, no destructors-on-panic, no landing pads. This is standard for production apps.
- **`opt-level = "s"`**: Tells LLVM to prefer smaller code over faster code. In practice, the performance difference vs `"2"` (default) is negligible for an I/O-bound app like Glyph. The `"z"` option is even more aggressive but can sometimes hurt performance in hot loops.

**Expected savings**: ~5–8 MB total
- `strip`: ~0.7 MB
- `panic = "abort"`: ~3.0–3.5 MB (eliminates all unwind tables)
- `lto = "thin"` + `codegen-units = 1`: ~1.5–3 MB (dead code elimination across 403 crates)
- `opt-level = "s"`: ~0.5–1 MB

**Risk**: None for normal operation. Only difference: if a panic occurs, the app terminates instantly instead of unwinding the stack. This is the standard behavior for release builds of production apps. No catch_unwind usage was found in the codebase.

**Compile time impact**: Release builds will be ~2–3× slower due to LTO and single codegen unit. Dev builds are unaffected.

---

## Phase 2: Deduplicate HTTP/TLS Stack (~2–4 MB savings)

### 2A. Fix the double TLS backend in reqwest

**Problem**: `reqwest v0.12.28` currently has **both** `native-tls` (macOS Security.framework via `hyper-tls` + `tokio-native-tls`) AND `rustls` (pure-Rust TLS via `hyper-rustls` + `tokio-rustls`) compiled in simultaneously. This is because:

- Your `Cargo.toml` specifies `features = ["rustls-tls"]`
- But reqwest's `default` feature includes `default-tls` which activates `native-tls`
- You didn't disable `default-features`

The full duplicated TLS stack pulled in:

```
native-tls v0.2.14         ← macOS Security.framework bindings
├── hyper-tls v0.6.0       ← HTTP+TLS connector using native-tls
└── tokio-native-tls v0.3.1

rustls v0.23.36            ← Pure Rust TLS implementation
├── ring v0.17.14          ← Crypto primitives (substantial C/assembly code)
├── hyper-rustls v0.27.7   ← HTTP+TLS connector using rustls
├── tokio-rustls v0.26.4
└── webpki-roots v1.0.5    ← Root certificate bundle
```

Two entire TLS implementations with their crypto, certificate handling, and HTTP connectors.

**Fix**: Change `src-tauri/Cargo.toml`:

```toml
# Before:
reqwest = { version = "0.12", default-features = false, features = ["blocking", "rustls-tls", "json", "stream"] }

# After:
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json", "stream"] }
```

Key changes:
- `default-features = false` removes the `default-tls` feature that pulls in `native-tls`
- Remove `blocking` if not needed (see 2B below)

**Which backend to keep**: `rustls` is the better choice because:
1. It's already required by `rig-core` regardless
2. It's a pure Rust implementation (no system library linking complexity)
3. `ring` (its crypto backend) is already compiled for `rig-core`
4. It bundles root certs via `webpki-roots`, making the app self-contained

**Expected savings**: ~0.5–1 MB (eliminating native-tls, hyper-tls, tokio-native-tls, Security.framework bindings)

### 2B. Remove `blocking` feature from reqwest

**Problem**: The `blocking` feature in reqwest compiles an entire synchronous HTTP runtime alongside the async one — it spawns its own tokio runtime internally. Looking at the codebase:

- `src/ai_rig/models.rs` — all model listing functions are `async fn` using `client.get(url).send().await`
- `src/ai_rig/runtime.rs` — streaming is fully async
- `src/links/fetch.rs` — uses reqwest async
- `src/ai_codex/` — uses JSON-RPC, not reqwest blocking

No usage of `reqwest::blocking::Client` was found anywhere in the codebase.

**Fix**: Remove `"blocking"` from the features list:

```toml
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json", "stream"] }
```

**Expected savings**: ~0.1–0.3 MB (removes the blocking adapter module and its internal runtime)

### 2C. Eliminate the duplicate reqwest v0.13

**Problem**: `tauri-plugin-updater v2.10.0` pulls in its own `reqwest v0.13.2`, which is a **completely separate copy** of the HTTP stack. This means the binary contains:

```
reqwest v0.12.28  ← used by your app + rig-core
reqwest v0.13.2   ← used only by tauri-plugin-updater
```

Each copy brings its own hyper, h2, http, tower, and TLS stack. These cannot be deduplicated by the linker because they are different semver-incompatible versions.

**Options** (choose one):

**Option A — Remove tauri-plugin-updater entirely**:
```toml
# Remove from Cargo.toml:
# tauri-plugin-updater = "2"

# Remove from lib.rs:
# .plugin(tauri_plugin_updater::Builder::new().build())

# Remove from package.json:
# "@tauri-apps/plugin-updater": "^2.10.0"
```
If you distribute via GitHub releases or a website and users re-download, this is the simplest path. You can always add a simple "check for updates" that just opens the releases page.

**Option B — Upgrade reqwest to 0.13 everywhere**: If `rig-core` supports reqwest 0.13 (or a newer version does), you could unify on a single version. This requires checking rig-core's compatibility.

**Option C — Pin tauri-plugin-updater to an older version**: If an older version of the updater plugin used reqwest 0.12, you could pin to that. This is fragile and not recommended long-term.

**Expected savings**: ~1–2 MB (eliminating the entire duplicate HTTP/TLS/hyper stack)

**Recommendation**: Option A is the cleanest. The updater plugin adds ~1–2 MB of binary size for a feature that many desktop apps handle via a simple "check website" button.

---

## Phase 3: Frontend Bundle Reduction (~1.5–2.5 MB savings)

### 3A. Remove or replace Mermaid

**Problem**: Mermaid is the single largest frontend dependency. In `dist/`, it accounts for **46 separate chunk files totaling ~1.9 MB**:

```
424 KB  cytoscape.esm          (graph rendering engine for architecture diagrams)
252 KB  katex                  (LaTeX math rendering)
144 KB  architectureDiagram
108 KB  sequenceDiagram
 80 KB  cose-bilkent           (graph layout algorithm)
 72 KB  blockDiagram
 68 KB  ganttDiagram
 68 KB  calendar
 68 KB  c4Diagram
 60 KB  flowDiagram
 40 KB  xychartDiagram
 40 KB  vennDiagram
 36 KB  quadrantDiagram
 32 KB  requirementDiagram
 32 KB  mermaid.core
 28 KB  rough.esm              (hand-drawn style renderer)
 28 KB  erDiagram
 28 KB  dagre                  (graph layout, x2 chunks)
 24 KB  sankeyDiagram
 24 KB  journeyDiagram
 24 KB  gitGraphDiagram
 20 KB  kanban
 20 KB  ishikawaDiagram
 ... plus ~20 more small chunks (4-12 KB each)
```

**Critical insight**: In Tauri 2, `frontendDist` is embedded into the binary. Every file in `dist/` becomes part of the `__const` segment. Code-splitting does NOT help — even lazy-loaded chunks that are never rendered are still compiled into the 26 MB binary. The 6.53 MB `__const` segment is largely these embedded frontend assets.

**Options** (in order of recommendation):

**Option A — Remove Mermaid entirely** (~1.9 MB savings):
Remove the `mermaid` dependency from `package.json` and any components that render Mermaid diagrams. In a markdown note-taking app, Mermaid diagrams are a niche feature. The markdown source (` ```mermaid ... ``` `) would still be preserved in notes — it just wouldn't render visually.

**Option B — Replace with a lighter renderer** (~1.5 MB savings):
Use a service-based approach where Mermaid rendering happens server-side:
- Use the mermaid.ink API to render diagrams as images/SVGs on demand
- Or use `@mermaid-js/mermaid-zenuml` which is smaller if you only need sequence diagrams
- This trades offline capability for significant size savings

**Option C — Use dynamic imports from external source** (~1.9 MB savings):
Instead of bundling Mermaid, load it from a CDN at runtime only when a mermaid code block is actually encountered. The `dist/` would not contain the chunks, so the binary would shrink. Downside: requires internet, first diagram render has latency.

### 3B. Audit highlight.js language bundle

**Problem**: `highlight.js` is 9.1 MB in `node_modules/`, but its contribution to `dist/` is more modest — it's likely bundled into `extensions-JoZx-E55.js` (552 KB). However, the default import registers **all ~190 languages**. For a markdown editor, you likely only need 10–15 common languages.

**Fix**: Instead of importing all of highlight.js, use lowlight (which you already have) with explicit language registration:

```typescript
// Instead of importing all languages:
import hljs from 'highlight.js'

// Import only the languages you need:
import { lowlight } from 'lowlight'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import html from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
// ... add more as needed
```

This approach should be checked against how `@tiptap/extension-code-block-lowlight` is currently configured to verify the current import strategy. If it's already using selective imports, the savings here are minimal.

**Expected savings**: ~100–300 KB (depends on current import strategy)

### 3C. Compress or downscale the app icon

**Problem**: `icon.icns` is **1.1 MB**. Most macOS app icons are 200–500 KB.

**Fix**: Re-export the icon with:
- Fewer size variants (remove 16x16, 32x32 if not visually important)
- Optimized PNG compression for each size variant
- Or use `iconutil` to rebuild from optimized PNGs

**Expected savings**: ~0.5–0.8 MB

---

## Phase 4: Rust Dependency Cleanup (~1–3 MB savings)

### 4A. Remove `chrono` — replace with `time`

**Problem**: Both `chrono` and `time` are included. `chrono` is used directly in 3 files:

```
src/databases/query.rs    — DateTime::parse_from_rfc3339, Local::now, Days, date comparisons
src/databases/store.rs    — Utc::now().to_rfc3339()
src/databases/commands.rs — Utc::now().to_rfc3339()
src/index/properties.rs   — DateTime, NaiveDate parsing
src/index/commands.rs      — Duration, NaiveDate
```

`time` is already in the dependency tree anyway (required by Tauri's `cookie` crate), so it costs nothing to keep. `chrono` and its dependency `iana-time-zone` are your app's exclusive additions.

**Fix**: Replace all `chrono` usage with `time` equivalents:

| chrono | time equivalent |
|--------|----------------|
| `chrono::Utc::now().to_rfc3339()` | `time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339)` |
| `chrono::DateTime::parse_from_rfc3339(s)` | `time::OffsetDateTime::parse(s, &Rfc3339)` |
| `chrono::Local::now().date_naive()` | `time::OffsetDateTime::now_local().map(\|dt\| dt.date())` |
| `chrono::Days::new(n)` | `time::Duration::days(n)` |
| `chrono::NaiveDate` | `time::Date` |

Add `"local-offset"` to time's features in Cargo.toml:
```toml
time = { version = "0.3", features = ["formatting", "parsing", "local-offset", "macros"] }
```

Then remove `chrono = ...` from `[dependencies]`.

**Expected savings**: ~0.1–0.2 MB (chrono + iana-time-zone code)

### 4B. Replace `serde_yaml` with a maintained alternative

**Problem**: `serde_yaml v0.9` is **deprecated** (the crate page says so explicitly). It's used extensively for frontmatter parsing in:

```
src/notes/frontmatter.rs  — serde_yaml::from_str, to_string, Mapping, Value
src/notes/properties.rs   — serde_yaml::Value, Number, Mapping, to_string, from_str
src/notes/commands.rs      — serde_yaml::Mapping, Value
src/databases/commands.rs  — serde_yaml::Mapping, Number, Value
src/index/frontmatter.rs  — serde_yaml::from_str
src/index/properties.rs   — serde_yaml::Value
```

**Fix**: Replace with `serde_yml` (the maintained successor) or `yaml-rust2` + `serde`. The API surface is similar — `serde_yml` is essentially a fork with the same types.

```toml
# Before:
serde_yaml = "0.9"

# After:
serde_yml = "0.0.12"
```

Most uses would just change the import path from `serde_yaml::` to `serde_yml::`. The `Mapping`, `Value`, `Number` types exist in both.

**Expected savings**: ~0 MB (similar binary size, but removes tech debt of depending on a deprecated crate)

### 4C. Remove `dotenvy`

**Problem**: `dotenvy` is in `Cargo.toml` but **has zero imports** in any `.rs` file. It's a dead dependency.

**Fix**: Remove from `src-tauri/Cargo.toml`:
```toml
# Remove:
dotenvy = "0.15"
```

**Expected savings**: Negligible (~10 KB), but removes dead code.

### 4D. Evaluate `tauri-plugin-notification`

**Problem**: `tauri-plugin-notification` is registered in `lib.rs` but a search shows no actual notification-sending code — only the plugin registration:

```rust
.plugin(tauri_plugin_notification::init())
```

The plugin pulls in `notify-rust` → `mac-notification-sys` which adds Objective-C bindings and the `time` crate usage.

**Fix**: If notifications aren't actually used yet, remove:
```toml
# Remove from Cargo.toml:
tauri-plugin-notification = "2"
```
```rust
// Remove from lib.rs:
.plugin(tauri_plugin_notification::init())
```

**Expected savings**: ~0.1–0.3 MB

### 4E. Consider using system SQLite on macOS

**Problem**: `rusqlite` with `features = ["bundled"]` compiles SQLite 3.x from C source (~250K lines of C) and statically links it. This is the safest option for cross-platform, but on macOS, a perfectly good SQLite ships with the OS.

**Current**:
```toml
rusqlite = { version = "0.31", features = ["bundled"] }
```

**Alternative** (macOS-only build):
```toml
rusqlite = { version = "0.31" }
```

Without `bundled`, rusqlite links against the system SQLite (`/usr/lib/libsqlite3.dylib` on macOS). This works reliably on macOS where SQLite is always present and kept updated by Apple.

**Caveat**: If you ever build for Linux or Windows, you'd need conditional compilation:
```toml
[target.'cfg(not(target_os = "macos"))'.dependencies]
rusqlite = { version = "0.31", features = ["bundled"] }

[target.'cfg(target_os = "macos")'.dependencies]
rusqlite = { version = "0.31" }
```

**Expected savings**: ~0.5–1 MB (the compiled SQLite C code in `__text`)

**Risk**: Low on macOS (SQLite is a system library). Higher on other platforms where SQLite may not be installed.

### 4F. Slim down `schemars`

**Problem**: You have two versions of `schemars` in the tree:
- `schemars v0.8.22` — your direct dependency (used in `tools.rs` for `#[derive(JsonSchema)]` on tool args)
- `schemars v1.2.0` — pulled in by `rig-core`

Your direct usage pulls in an older `indexmap v1.9.3` alongside the modern `indexmap v2.x` that the rest of the tree uses. This is a duplicate.

**Fix**: If you remove rig-core (see Phase 5), you can remove schemars entirely and hand-write the small JSON schemas for your 10 tools. If you keep rig-core, consider upgrading your direct schemars to v1.x to deduplicate.

**Expected savings**: ~0.05–0.1 MB (eliminates duplicate indexmap + schemars code)

---

## Phase 5: Replace `rig-core` with Direct API Calls (~3–5 MB savings)

### The case for removal

`rig-core v0.24.0` is the single largest non-Tauri dependency. It pulls in **~100 transitive crates** including:

```
rig-core v0.24.0
├── reqwest (with multipart, json, stream)   ← you already have this
├── schemars v1.2.0                          ← duplicate of your v0.8
├── futures (full crate, not just futures-util)
├── futures-timer
├── rig-derive (proc macro + deluxe + indoc)
├── eventsource-stream + nom               ← SSE parsing
├── ordered-float + num-traits
├── mime_guess
├── glob
├── as-any
├── tracing-futures
└── ... ~80 more transitive deps
```

### What rig-core actually does for Glyph

After reading all of `ai_rig/runtime.rs` (the only file that uses rig-core's core functionality), here is everything rig-core provides:

1. **Provider client construction** (`openai::Client::builder(key).build()` etc.) — thin wrappers that set base URLs and auth headers on reqwest
2. **`AgentBuilder` + `Agent`** — configures system prompt, max tokens, and tool list, then constructs API request payloads
3. **`stream_prompt().multi_turn(4)`** — sends the request, parses SSE stream, handles tool call/result loop up to 4 turns
4. **`Tool` trait + `ToolDefinition`** — defines the interface for tools (name, description, JSON schema, async call method)
5. **SSE parsing** — `eventsource-stream` parses `data: {...}` lines from the streaming response

### What a replacement looks like

All five providers you use (OpenAI, Anthropic, Gemini, OpenRouter, Ollama) follow one of two API formats:

**OpenAI-compatible** (OpenAI, OpenRouter, Ollama, OpenAI-compat):
```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <key>

{
  "model": "gpt-4o",
  "messages": [...],
  "tools": [...],
  "stream": true
}

Response: SSE stream of {"choices": [{"delta": {"content": "..."}}]}
```

**Anthropic**:
```
POST /v1/messages
Content-Type: application/json
x-api-key: <key>
anthropic-version: 2023-06-01

{
  "model": "claude-sonnet-4-20250514",
  "messages": [...],
  "tools": [...],
  "stream": true
}

Response: SSE stream of {"type": "content_block_delta", "delta": {"text": "..."}}
```

**Gemini**:
```
POST /v1beta/models/{model}:streamGenerateContent
Content-Type: application/json

{
  "contents": [...],
  "tools": [...],
}

Response: JSON array stream
```

### Implementation structure

The replacement would be approximately **400–600 lines** across a few files:

```
src/ai_rig/
├── client.rs        (~150 lines) — Generic streaming chat client
│   - build_request(provider, model, messages, tools) -> reqwest::Request
│   - stream_chat(request) -> impl Stream<Item = ChatEvent>
│   - SSE line parser (~50 lines)
│
├── providers.rs     (~150 lines) — Provider-specific request/response formatting
│   - OpenAI format (covers OpenAI, OpenRouter, Ollama, OpenAI-compat)
│   - Anthropic format
│   - Gemini format
│   - Each: build_body(), parse_chunk()
│
├── tool_loop.rs     (~100 lines) — Multi-turn tool calling loop
│   - Send prompt → get response
│   - If tool_calls in response → execute tools → append results → re-send
│   - Repeat up to N turns
│   - Emit events to frontend via app.emit()
│
└── tools.rs         (keep as-is, ~650 lines) — Tool implementations
    - Remove `use rig::...` imports
    - Replace `impl Tool for X` with a simpler hand-rolled trait
    - Keep the actual tool logic unchanged
    - Hand-write JSON schemas (or keep schemars for this)
```

### Dependencies eliminated by removing rig-core

The following would no longer be needed (unless pulled by another dep):

```
rig-core, rig-derive, deluxe, deluxe-core, deluxe-macros, indoc,
as-any, async-stream, async-stream-impl, eventsource-stream,
futures (full), futures-executor, futures-timer, futures-io,
glob (rig's copy), mime_guess, nom, minimal-lexical, ordered-float,
num-traits, tracing-futures, pin-project, convert_case,
unicode-segmentation, schemars v1.2 (rig's copy), schemars_derive v1.2,
ref-cast, ref-cast-impl, dyn-clone, serde_derive_internals
```

That's approximately **30+ crates** of pure code elimination.

### What you'd keep

- `reqwest` — you already have it, just reuse the same client
- `serde` + `serde_json` — already in tree
- `tokio` — already in tree
- `futures-util` — already a direct dependency (for `StreamExt`)
- `schemars v0.8` — keep if you want auto-generated JSON schemas for tools, or hand-write the 10 schemas (~20 lines each)

### Risk assessment

- **Medium effort**: ~1–2 days of development
- **Low risk**: The actual tool implementations don't change. Only the HTTP client and streaming layer changes.
- **Testing**: Each provider needs manual testing with streaming + tool calling
- **Maintenance**: You own the ~500 lines of client code, but provider APIs rarely change

---

## Phase 6: Minor Optimizations (diminishing returns)

### 6A. Remove `core-text` if system font enumeration isn't critical

**Problem**: `core-text v20.1.0` (macOS-only) pulls in `core-foundation`, `core-graphics`, `foreign-types`, and old `bitflags v1.3.2`. It's used solely for `system_fonts::list_system_font_families()` and `list_monospace_font_families()`.

**Alternative**: Use the `font-kit` crate (if lighter) or enumerate fonts via `NSFontManager` through objc2 bindings that Tauri already includes.

**Expected savings**: ~0.1–0.2 MB

### 6B. UPX compression (post-build)

**Problem**: Even after all optimizations, the binary contains compressible data.

**Fix**: Apply UPX compression to the final binary:
```bash
upx --best target/release/glyph
```

UPX typically achieves 50–60% compression on Rust binaries. A 15 MB binary could become ~7 MB. The binary self-decompresses on launch with ~50ms overhead.

**Caveat**: UPX-compressed binaries can trigger false positives in some antivirus software, and macOS code signing may need special handling. Not recommended for distribution if you code-sign the app.

**Expected savings**: 40–60% of final binary size

### 6C. Review `@hugeicons/core-free-icons` tree-shaking

**Problem**: `@hugeicons/core-free-icons` is 58 MB in `node_modules/`. Vite should tree-shake unused icons, but verify that only imported icons end up in `dist/`. If tree-shaking isn't working properly, this could be contributing more than expected to the frontend bundle.

**How to verify**: Run `npx vite-bundle-visualizer` and check the hugeicons contribution.

**Expected savings**: Potentially 0 (if tree-shaking works) or up to ~100 KB (if it doesn't)

---

## Summary: Expected Impact

| Phase | Action | Est. Savings | Effort | Risk |
|-------|--------|-------------|--------|------|
| **1A** | Release profile (strip, LTO, panic=abort, opt-level=s) | **5–8 MB** | 5 min | None |
| **2A** | Fix reqwest double TLS (disable default-features) | **0.5–1 MB** | 15 min | None |
| **2B** | Remove `blocking` feature from reqwest | **0.1–0.3 MB** | 5 min | None |
| **2C** | Remove tauri-plugin-updater (eliminates reqwest v0.13) | **1–2 MB** | 30 min | Low |
| **3A** | Remove/replace Mermaid | **1.5–1.9 MB** | 2–4 hrs | Low |
| **3B** | Audit highlight.js language bundle | **0.1–0.3 MB** | 30 min | None |
| **3C** | Compress app icon | **0.5–0.8 MB** | 15 min | None |
| **4A** | Remove chrono (use time) | **0.1–0.2 MB** | 1 hr | None |
| **4B** | Replace serde_yaml with serde_yml | **~0 MB** | 1 hr | None |
| **4C** | Remove dotenvy (dead dep) | **~0 MB** | 1 min | None |
| **4D** | Remove tauri-plugin-notification (unused) | **0.1–0.3 MB** | 5 min | None |
| **4E** | System SQLite on macOS | **0.5–1 MB** | 30 min | Low |
| **4F** | Deduplicate schemars | **0.05–0.1 MB** | 15 min | None |
| **5** | Replace rig-core with direct API calls | **3–5 MB** | 1–2 days | Medium |
| **6A** | Remove core-text dep | **0.1–0.2 MB** | 1 hr | Low |
| **6B** | UPX compression | **40–60%** | 5 min | Medium |
| **6C** | Verify icon tree-shaking | **0–0.1 MB** | 15 min | None |

### Projected final sizes

| Scenario | Estimated .app size |
|----------|-------------------|
| Current | **33 MB** |
| Phase 1 only (release profile) | **~25–28 MB** |
| Phases 1–2 (+ TLS/HTTP dedup) | **~22–25 MB** |
| Phases 1–3 (+ frontend trim) | **~20–23 MB** |
| Phases 1–4 (+ Rust cleanup) | **~18–21 MB** |
| Phases 1–5 (+ replace rig-core) | **~14–17 MB** |
| All phases including UPX | **~7–10 MB** |

---

## Recommended Execution Order

1. **Phase 1A** — Add release profile. Rebuild. Measure. (5 minutes, biggest single win)
2. **Phase 4C** — Remove dotenvy. (1 minute, dead code)
3. **Phase 4D** — Remove notification plugin if unused. (5 minutes)
4. **Phase 2A + 2B** — Fix reqwest features. (15 minutes)
5. **Phase 3C** — Compress icon. (15 minutes)
6. **Phase 2C** — Remove updater plugin. (30 minutes, needs product decision)
7. **Phase 4A** — Remove chrono. (1 hour)
8. **Phase 3A** — Remove/replace Mermaid. (2–4 hours, needs product decision)
9. **Phase 4E** — System SQLite. (30 minutes)
10. **Phase 5** — Replace rig-core. (1–2 days, biggest architectural change)
11. **Phase 3B, 4B, 4F, 6A, 6C** — Remaining cleanup.

Measure the binary size after each phase to validate savings and catch regressions.
