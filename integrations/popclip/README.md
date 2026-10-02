# PopClip

Select text in any app, then click Glyph in PopClip to save it as a new Markdown note and open it in Glyph. Notes go in the root of the space configured in the extension. The first line supplies the filename, with a unique suffix to prevent overwriting existing notes. Markdown in the selected text is preserved.

## Install

1. Install a Glyph release that includes this integration and launch it once.
2. Download `Glyph.popclipextz` from the same [GitHub release](https://github.com/SidhuK/Glyph/releases) and double-click it. Confirm installation in PopClip. From a source checkout, double-click the `Glyph.popclipext` folder instead.
3. In the extension's PopClip preferences, set **Space folder** to the full path of an existing Glyph space. Select the folder in Finder and press Option-Command-C to copy its path. Use an absolute path such as `/Users/you/Documents/Notes`, without quotes or `~`.
4. Select text and click **Save to Glyph**. Glyph opens the configured space, saving open editors through its usual space-switch flow, then creates and opens the note.

The extension requires PopClip build 4151 or later. Selections are limited to 16,384 characters. If the space preference is missing, clicking the extension opens its preferences. If the folder is missing or Glyph cannot save the note, Glyph displays an error. The extension does not use the clipboard, shell scripts, or network requests.

## URL interface

`glyph://create/note?space=<encoded absolute space path>&text=<encoded Markdown>`

Encode both values separately with `encodeURIComponent`. Both parameters are required. Glyph preserves the text's whitespace and rejects blank text, NUL characters, text over 64 KiB in UTF-8, duplicate or unknown parameters, and URLs over 256 KiB. Existing notes are never overwritten. Cold starts use Glyph's existing pending URL queue.

## Package a download

From this directory:

```sh
zip -r Glyph.popclipextz Glyph.popclipext
```

The release workflow packages and uploads this file alongside Glyph. PopClip may delete the downloaded archive after installing it.

## Manual verification on macOS

- Install the extension and capture multiline text containing emoji, `&`, `+`, `%`, `#`, and non-Latin characters. Confirm the complete content appears in the new note and is searchable.
- Repeat with Glyph quit, running, and showing a different space. Confirm each deliberate capture creates one note in the configured space.
- Capture the same selection twice and confirm the first note remains unchanged.
- Use an empty preference, a missing folder, and a read-only space. Confirm preferences or a visible error appear, with no success implied by Glyph.

Implementation references: PopClip's [JavaScript actions](https://www.popclip.app/dev/js-actions), [configuration](https://www.popclip.app/dev/config), and [extension packages](https://www.popclip.app/dev/packages).
