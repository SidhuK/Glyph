# Glyph Licensing

Glyph is open source, but official release binaries are licensed.

## What is licensed

- The source code remains public on GitHub.
- Official binaries published through the GitHub release workflow include:
  - a 7-day free trial
  - Gumroad license-key activation
  - offline use after one successful activation

## What is not gated

- Local development builds
- Self-built community builds
- Source access on GitHub

The app decides this using the `GLYPH_OFFICIAL_BUILD=1` release-build flag.

## License model

- One-time purchase
- Lifetime access
- Unlimited devices
- No seat limits
- No device binding
- No periodic online rechecks after activation

## Where licensing appears in the app

There are three entry points:

1. Trial banner
   - During the 7-day trial, Glyph shows a banner with:
     - remaining trial time
     - `Enter License Key`
     - `Buy on Gumroad`

2. Lock screen
   - After the trial expires, Glyph shows a full-screen activation view before the app shell loads.

3. Settings and command palette
   - Open `Settings -> General -> License`
   - Or use the command palette:
     - `Manage license`
     - `Buy Glyph license`

## Verification flow

Glyph verifies license keys directly against Gumroad using the product ID configured for the official release build.

- Verification endpoint: `POST https://api.gumroad.com/v2/licenses/verify`
- The app does not store the raw license key on disk.
- The app stores:
  - masked license key
  - key hash
  - activation timestamps
  - trial timestamps

## Offline behavior

After Gumroad verifies a key once:

- Glyph stores a local activation record.
- Glyph continues working offline forever on that install profile.

This is an honest-user licensing model for official binaries, not DRM.

## Support

Licensing support currently routes to the Glyph feedback board:

- [Glyph Feedback](https://glyph.userjot.com/?cursor=1&order=top&limit=10)

## Purchase

- [Buy Glyph on Gumroad](https://karatsidhu.gumroad.com/l/sqxfay)
- [Download official releases on GitHub](https://github.com/SidhuK/Glyph/releases)
