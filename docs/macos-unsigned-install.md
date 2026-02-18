# Install Glyph on macOS (Unsigned Build)

Use this guide if Glyph is distributed outside the App Store and is not Apple notarized.

## What users should expect

macOS Gatekeeper will likely block first launch with a message like:

- "Glyph can't be opened because Apple cannot check it for malicious software."
- "Glyph cannot be opened because the developer cannot be verified."

This is expected for unsigned or unnotarized builds.

## User install steps

1. Download Glyph from your official release link.
2. Move `Glyph.app` to `Applications`.
3. Try opening Glyph once (it will be blocked).
4. Open `System Settings` -> `Privacy & Security`.
5. Scroll to the security section and click `Open Anyway` for Glyph.
6. Confirm by clicking `Open` in the next dialog.

After this one-time approval, Glyph should open normally.

## Alternative method (Finder)

1. In Finder, right-click `Glyph.app`.
2. Click `Open`.
3. Click `Open` again in the warning dialog.

## Copy for release notes

You can paste this in GitHub Releases:

> Glyph is currently distributed as an unsigned macOS app.  
> On first launch, macOS may block it.  
> To open: move it to Applications, launch once, then go to System Settings -> Privacy & Security and click "Open Anyway."
