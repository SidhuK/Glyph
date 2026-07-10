# Vim-mode reference review

## Scope

This note records the decision for [issue 269](https://github.com/SidhuK/Glyph/issues/269), as of 2026-07-10: Glyph uses the upstream CodeMirror Vim extension in Raw Markdown mode only. The former rich-editor implementation is removed.

## Findings

### `@replit/codemirror-vim`

[`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim) is a CodeMirror 6 extension, not a generic JavaScript Vim engine. Its published package declares CodeMirror state, view, commands, language, and search packages as peer dependencies ([package manifest](https://github.com/replit/codemirror-vim/blob/master/package.json)).

The extension is installed in a CodeMirror `EditorView` extension list, before other keymaps. It requires `drawSelection` for correct visual-selection rendering when an application does not use CodeMirror's `basicSetup` ([usage instructions](https://github.com/replit/codemirror-vim#usage)).

It does provide a CM5-compatibility facade through `getCM(view)` and exports `Vim` methods for ex commands, mappings, unmappings, and custom operators ([README API section](https://github.com/replit/codemirror-vim#usage-of-cm5-vim-extension-api)). That facade remains attached to a CodeMirror `EditorView`; it is not an adapter for ProseMirror.

The implementation owns editor-specific behavior: it maps CodeMirror view updates into its CM5 facade, uses CodeMirror search effects and decorations for Vim search highlighting, renders a block cursor, and creates a panel that exposes the current mode and command/search input ([extension source](https://github.com/replit/codemirror-vim/blob/master/src/index.ts)). These are useful parity categories: modal cursor/selection, normal/visual/operator grammar, search, command line, status, and configuration hooks.

### Obsidian Hub guide

The supplied display URL currently returns `Not Found`, but the Hub's published Markdown source is available through its publish host ([source](https://publish-01.obsidian.md/access/e25082da1bfe16d54e36618cd5bfee68/04%20-%20Guides%2C%20Workflows%2C%20%26%20Courses/for%20Vim%20users.md)). The guide says to enable **Vim key bindings** in Obsidian's Editor settings; it identifies `replit/codemirror-vim` as the implementation; and it says that Obsidian does not include every Vim command but does include most of them. It recommends the Obsidian-specific [vimrc Support plugin](https://obsidian.md/plugins?id=obsidian-vimrc-support) for `.vimrc` use, alongside other ecosystem plugins and example configurations.

This is a community-maintained Obsidian Hub guide, not a maintained first-party command contract. It establishes the ecosystem expectation as the Replit CodeMirror adapter plus user configuration, rather than complete Vim parity. Any claimed Obsidian parity list must still be captured from a reproducible Obsidian version and editor mode before it becomes acceptance criteria.

## Glyph compatibility assessment

Glyph has two separate editor engines:

- The rich editor is TipTap 3 over ProseMirror. It has no Vim mode.
- The raw Markdown editor is CodeMirror 6 and uses [`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim) through [`createRawMarkdownExtensions`](../../src/components/editor/raw/extensions.ts).

`@replit/codemirror-vim` is compatible with Glyph's raw Markdown editor: Glyph already installs the required CodeMirror 6 family and `drawSelection`. It is not compatible with the rich TipTap/ProseMirror editor, which is deliberately out of scope.

Raw-only Vim support is disabled by default and configured from Editor Settings. The upstream Vim status panel supplies mode feedback, while custom mappings and vimrc support remain out of scope.

## Decision

1. Use the CodeMirror package in Raw Markdown mode only; never import it into TipTap.
2. Remove the rich-editor Vim implementation and all of its settings, help, tests, and documentation.
3. Use upstream behavior without custom mappings or vimrc support. Obsidian remains a reference, not a 1:1 compatibility contract.

## Source links

- [replit/codemirror-vim README](https://github.com/replit/codemirror-vim#readme)
- [replit/codemirror-vim package manifest](https://github.com/replit/codemirror-vim/blob/master/package.json)
- [replit/codemirror-vim implementation](https://github.com/replit/codemirror-vim/blob/master/src/index.ts)
- [Obsidian Hub guide source](https://publish-01.obsidian.md/access/e25082da1bfe16d54e36618cd5bfee68/04%20-%20Guides%2C%20Workflows%2C%20%26%20Courses/for%20Vim%20users.md)
- [Supplied Obsidian Hub display URL](https://publish.obsidian.md/hub/04+-+Guides%2C+Workflows%2C+%26+Courses/for+Vim+users)
- [CodeMirror 5 Vim API reference](https://codemirror.net/5/doc/manual.html#vimapi)
