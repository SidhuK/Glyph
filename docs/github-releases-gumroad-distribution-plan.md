# Glyph Plan: Public GitHub Releases + Paid Gumroad (No License Keys)

## Goal

Ship Glyph as:

- Public source code on GitHub
- Public GitHub Releases (free downloads)
- Paid Gumroad listing for official convenience/support
- No license keys, no activation gate, no trial system
- macOS-only, unsigned, and not notarized (current constraint)

This model is intentionally simple:

- Anyone can download free binaries from GitHub Releases.
- Users who want to support you can buy from Gumroad.
- Both paths use the same app build.

---

## Product Model

## Free vs paid

- Free (GitHub):
  - Source code
  - Build from source
  - Download release binaries
- Paid (Gumroad):
  - Same app binaries
  - Convenience of storefront purchase flow
  - Optional supporter perks (priority support, early announcements)

## Positioning copy (recommended)

- "Glyph is open source and free from GitHub Releases."
- "If you want to support development, buy the official build on Gumroad."

---

## Distribution Flow

1. Build release artifacts in CI.
2. Publish artifacts to GitHub Releases.
3. Upload the same release binary to Gumroad product.
4. Publish release notes and changelog on GitHub.
5. Announce update with links:
   - Free download (GitHub)
   - Supporter purchase (Gumroad)

---

## Update Strategy

## In-app updates

- Keep Tauri updater pointed at public GitHub release artifacts.
- All users get update checks and installs the same way.
- No paid gating in app.

## Gumroad updates

- Upload newest binary to existing Gumroad product.
- Buyers can re-download latest version from Gumroad library.
- Gumroad is a payment/support channel, not the technical updater backend.

---

## One Complete Phase: Publish Everything

This is a single all-in launch phase.

## Scope

1. Legal and messaging
   - Add `LICENSE` (MIT or AGPL)
   - Add optional `TRADEMARK.md`
   - Update `README.md` with free + supporter model
2. Release pipeline
   - Productionize GitHub release workflow
   - Ensure updater artifacts + `latest.json` are published
   - Fix workflow placeholders and release naming
3. Gumroad setup
   - Create product page and pricing
   - Add clear copy: same app is available free on GitHub
   - Add update communication plan for buyers
4. Website/docs updates
   - Add download section with both links
   - Add FAQ: "Why pay if it's free on GitHub?"
5. QA and launch checks
   - Install/update checks from GitHub release channel
   - Download/install sanity check from Gumroad file
   - Changelog/release-note consistency

## Exit criteria

All of the following are true:

1. Public repo and GitHub releases are live.
2. Gumroad product is live with matching current build.
3. In-app updater works from GitHub release channel.
4. README/docs clearly explain free vs paid support model.
5. Launch links and release notes are consistent.

---

## Repo Touchpoints

- [src-tauri/tauri.conf.json](/Users/karatsidhu/Code/Glyph/src-tauri/tauri.conf.json)
  - Fill updater placeholders (`pubkey`, owner/repo endpoint)
- [.github/workflows/tauri-release.yml](/Users/karatsidhu/Code/Glyph/.github/workflows/tauri-release.yml)
  - Replace placeholders and publish workflow for real releases
- [docs/updater-setup.md](/Users/karatsidhu/Code/Glyph/docs/updater-setup.md)
  - Keep as updater runbook (GitHub-based)
- [README.md](/Users/karatsidhu/Code/Glyph/README.md)
  - Add free GitHub + paid Gumroad support messaging

---

## QA Checklist

1. Fresh install from GitHub release opens normally.
2. Updater check finds and installs new release.
3. Fresh install from Gumroad file opens normally.
4. GitHub and Gumroad binaries match expected version.
5. Release notes/changelog align with shipped artifacts.
6. macOS unsigned install guidance remains accurate.

---

## Launch-Day Runbook

1. Merge release-ready code to main.
2. Bump versions and create release tag.
3. Run GitHub release workflow and verify artifacts.
4. Upload the same release binary to Gumroad.
5. Publish/update docs and website links.
6. Announce release with both download options.

---

## Immediate Next Actions

1. Confirm final pricing on Gumroad ($10 vs $15).
2. Choose license type (MIT vs AGPL).
3. Replace updater placeholders and finalize release workflow.
4. Update README with the simplified distribution model.
