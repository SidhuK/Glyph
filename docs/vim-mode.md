# Vim mode

Glyph provides Vim mode in the **Raw Markdown** editor only. Enable it in **Settings → Editor → Vim Mode**, then open a note in Raw Markdown mode. It is disabled by default.

Glyph uses the upstream CodeMirror Vim command set. It does not add its own mappings or Vim configuration layer.

## Modes and inserting text

| Command | Action |
| --- | --- |
| `Esc` | Return to Normal mode. |
| `i`, `a` | Insert before or after the cursor. |
| `I`, `A` | Insert at the start or end of the line. |
| `o`, `O` | Open a line below or above, then insert. |
| `v`, `V`, `Ctrl-v` | Enter character, line, or block Visual mode. |

The status panel shows the active mode and hosts search and command prompts.

## Moving around

| Command | Action |
| --- | --- |
| `h`, `j`, `k`, `l` | Move left, down, up, and right. |
| `0`, `^`, `$` | Move to the line start, first non-blank character, or line end. |
| `w`, `b`, `e` | Move by words. Use `W`, `B`, `E` for whitespace-delimited words. |
| `gg`, `G` | Move to the first or last line. |
| `f{char}`, `F{char}`, `t{char}`, `T{char}` | Find a character on the current line. Repeat with `;` or reverse with `,`. |
| `{count}{motion}` | Repeat a motion, such as `5j`, `3w`, or `10G`. |

## Selecting, editing, and repeating

Vim operators combine with motions and text objects:

| Command | Action |
| --- | --- |
| `d{motion}`, `c{motion}`, `y{motion}` | Delete, change, or yank through a motion. |
| `dd`, `cc`, `yy` | Delete, change, or yank the current line. |
| `dw`, `cw`, `yw` | Delete, change, or yank a word. |
| `diw`, `ciw`, `yiw` | Act on the inner word. Use `aw` for a word including surrounding whitespace. |
| `di(`, `ci"`, `da[` | Act inside or around paired delimiters. Parentheses, brackets, braces, and quotes are supported. |
| `x`, `X`, `s`, `r{char}` | Delete a character, delete backward, substitute, or replace one character. |
| `D`, `C`, `S`, `J` | Delete to line end, change to line end, substitute a line, or join lines. |
| `p`, `P` | Put yanked or deleted text after or before the cursor. |
| `u`, `Ctrl-r`, `.` | Undo, redo, or repeat the last change. |

Visual selections work with these operators too. For example, use `v` to select text and then `d`, `c`, or `y`.

## Finding text

| Command | Action |
| --- | --- |
| `/query` | Search forward. Press `Enter` to run the search. |
| `?query` | Search backward. |
| `n`, `N` | Move to the next or previous match. |
| `*`, `#` | Search forward or backward for the word under the cursor. |
| `:s/old/new/`, `:%s/old/new/g` | Substitute within the line or throughout the document. |
| `:noh` | Clear search highlighting. |

## Not included

- Vim mode does not run in the Rich editor.
- Glyph does not support custom mappings, Vimscript, or `.vimrc` files.
- Vim write and file-management commands do not replace Glyph's normal saving and note management.

