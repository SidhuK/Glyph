# Glyph

Glyph is an offline-first workspace for notes and actionable Markdown tasks.

## Language

**Daily note**:
A note associated with one calendar date in the configured daily-notes folder.

**Checkbox move**:
The transfer of an unfinished Markdown checkbox item to another daily note. The source keeps a non-actionable, visually emphasized “moved to” record linking to the destination date; only the destination contains the unfinished checkbox item.
_Avoid_: Copy, delete, duplicate

**Checkbox block**:
A checkbox item together with its indented continuation content and descendant checkboxes. A move treats the block as one unit while preserving the completion state of each checkbox in the destination.
_Avoid_: Task tree

**Rollover candidate**:
An unfinished Markdown checkbox item in an earlier daily note that Glyph has detected but has not moved. Candidates remain unchanged until the user selects them for a checkbox move.
_Avoid_: Task, imported item, moved item

**Overdue item**:
A rollover candidate whose source daily note predates the daily note currently being viewed or created.
_Avoid_: Overdue note, overdue task

**Rollover review**:
The selection step that groups rollover candidates by their source dates before any Markdown is changed.
_Avoid_: Automatic import
