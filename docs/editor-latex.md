# LaTeX equations in Markdown notes

Glyph renders LaTeX mathematics with KaTeX while keeping ordinary Markdown as
the durable file format. This is mathematical typesetting, not a full TeX
compiler: Glyph does not load arbitrary TeX packages, execute commands, compile
documents, or resolve bibliography files.

## Syntax

Use one dollar sign on each side for an inline equation:

```markdown
The relationship is $E = mc^2$.
```

Use dollar-sign fences on their own lines for a display equation:

```markdown
$$
\begin{aligned}
  a &= b + c \\
  x &= \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
\end{aligned}
$$
```

Escape a literal dollar sign as `\$`. Math delimiters inside frontmatter, code
spans, and fenced code blocks are left as source text.

## Edit, Preview, and Raw

- In **Edit**, type `/latex` and choose an inline or display equation. Click an
  existing equation to edit its LaTeX source. Press `Cmd/Ctrl+Enter` to apply or
  `Escape` to cancel.
- In **Preview**, equations render through KaTeX but cannot be edited.
- In **Raw**, the `$…$` and `$$…$$` source remains visible. LaTeX ranges receive
  syntax highlighting, command completion, bracket matching, and environment
  assistance. Type `/latex` for equation snippets or press `Cmd/Ctrl+Shift+M`
  to wrap the selection as inline math.

Invalid or unsupported formulas remain in the Markdown file and can always be
corrected in Edit or Raw mode. KaTeX's supported-function reference describes
the available commands and environments: <https://katex.org/docs/supported>.
