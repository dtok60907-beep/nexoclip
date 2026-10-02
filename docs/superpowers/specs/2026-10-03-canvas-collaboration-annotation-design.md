# Canvas Collaboration and Annotation Tools

**Date:** 2026-10-03
**Status:** Approved (2026-10-03)

## Objective

Give Canvas the collaboration and annotation tools teams expect from a shared
board: a project chat, Figma-style cursor messages, comment pins, sticky
notes, text labels, groups, tables, and freehand drawing. None of these take
part in generation; they annotate and organize the board.

## Background

- The realtime document (Yjs) holds `nodes`, `edges`, and `meta`; it is
  persisted by the realtime server and projected to Postgres. Cursors,
  selection, and edit locks travel through Yjs **awareness**, which is
  ephemeral and never stored.
- Comment and Sticker tools existed and were removed in `62313dc`
  (2026-09-30, "no longer part of the toolset"). A resizable Notes node was
  added in `b3091f4` and reverted in `add18d4` (2026-09-15) together with the
  Sand toolbar theme; `lib/canvas-dark-rollback.test.ts` asserts Notes stay
  removed and must change when Notes return.
- Per-node lock already exists (`node.data.locked`, toolbar padlock) and the
  collaborator ownership lock (`2026-09-18-canvas-node-ownership-lock`).
- The header **Mengobrol** button exists with no action; **Bagikan** was
  removed (#13).

## Principles

- Board objects (comment, note, text, group, table, drawing) are **document
  nodes**. They get realtime sync, persistence, scenes, undo/redo, copy/paste,
  duplicate, delete, lock, and ownership locks for free, and have **no
  handles** (they cannot connect to generators).
- Chat history is persisted in the document; cursor messages are awareness
  only.
- Everything works for every collaborator on the project; read-only viewers
  can see but not change.
- **Deleting a board object never reloads the page or trips the node error
  boundary.** The old Notes and Comments did (reported by the user), which is
  why they were removed. Board objects are deleted only through the existing
  node delete path (Delete key, node toolbar, context menu) — no bespoke
  in-node delete buttons — every button is `type="button"`, and a DOM test
  deletes each board object type and asserts no navigation and no error
  boundary.

## Features

### 1. Project chat (Mengobrol panel)

- The header **Mengobrol** button toggles a right-side panel (same slot as
  the Jobs panel; opening one closes the other).
- Messages: author name + presence color, text, relative time. Enter sends,
  Shift+Enter is a newline. Max 2,000 characters per message.
- Stored in a new `Y.Array('chat')` of `{ id, participantId, name, text,
  createdAt }`; the newest 500 are kept (older entries pruned on append).
- Unread count badge on the button while the panel is closed (last-read
  timestamp per browser in localStorage).
- A short notification sound plays for messages from others while the panel
  is closed or the tab is hidden (Web Audio beep, no asset file); a mute
  toggle in the panel header is remembered per browser.
- A message can be deleted by its author.

### 2. Cursor messages (`/`)

- Pressing `/` while no text field is focused opens a small input bubble
  attached to the user's cursor; the bubble follows the cursor as they type.
- Every keystroke is published to awareness as `cursorChat: { text,
  updatedAt }`; collaborators see the bubble under that user's cursor in
  their color.
- Enter or Esc closes the input; the last text stays visible to others for 5
  seconds, then clears. Max 120 characters. Never persisted.

### 3. Comment pins

- Tool: **Comment** (shortcut `C`). Click anywhere to drop a pin (location
  marker icon in the author's color) and type the first message.
- Hovering a pin shows a popover with the thread; clicking opens it pinned so
  you can reply. Each entry: author, time, text; authors can edit/delete
  their own entries.
- Threads can be **resolved** (pin turns grey and hides behind a "show
  resolved" toggle in the bottom bar) and reopened.
- Node type `comment`, fixed small size, not resizable, data `{ thread: [...],
  resolved, createdBy }`.

### 4. Sticky notes

- Tool: **Note** (`N`). Rebuilds the `b3091f4` note node: resizable, plain
  text, collaborative editing through the existing prompt-style text sync.
  Unlike the old node it has no hover delete button (see Principles).
- Paper look with 6 colors (yellow default) chosen from the node toolbar.

### 5. Text

- Tool: **Text** (`T`). Borderless text label for titles and section
  headings: sizes S / M / L / XL, bold toggle, color from the note palette.
- Auto-width while typing; resizable width wraps.

### 6. Groups

- Select nodes → **Group** (`Ctrl+G`) wraps them in a named frame; `Ctrl+
  Shift+G` ungroups. Implemented with React Flow sub-flows (`parentId`), so
  members move with the frame.
- Dragging a node into / out of a frame adds / removes it.
- Frame toolbar: rename, color, lock (locks the frame and every member).
- Deleting a frame (Delete key or toolbar) keeps its members in place; the
  frame toolbar's **With contents** button deletes the frame and its members.
- Copying or duplicating a frame copies its members into the new frame.
- Sticky notes use the `stickyNote` type; the removed `note` type stays
  auto-deleted by `LegacyNoteCleanup`.

### 7. Tables

- Tool: **Table**. Generic editable grid (default 3×3, header row), add /
  remove rows and columns, resize node. Cells are plain text; Tab / Enter move
  between cells.
- Stored in node data `{ columns: string[], rows: string[][] }`.
- Not a shot list in this phase (see Open questions).

### 8. Freehand drawing

- Tool: **Pen** (`P`) with 5 colors and 3 widths; **Eraser** deletes whole
  strokes it touches.
- Each finished stroke becomes a `drawing` node: an SVG path in node data,
  positioned at its bounding box, so strokes can be selected, moved, deleted,
  locked, and grouped like any node.
- Annotation only in this phase; using a sketch as a generation input is a
  later feature.

## Toolbar

Bottom bar tools: Select (`V`), Hand (`H`), Cut, **Comment (`C`)**, **Note
(`N`)**, **Text (`T`)**, **Pen (`P`)**, **Table**. Group lives in the
selection context menu and `Ctrl+G`. Shortcuts are ignored while typing.

## Phasing

1. **Collaboration:** project chat, cursor messages, comment pins.
2. **Board objects:** sticky notes, text, groups.
3. **Rich objects:** tables, freehand drawing.

Each phase ships on its own branch and PR with tests.

## Testing

- Unit: chat append/prune and unread counting, cursor-chat awareness
  projection and expiry, comment thread reducer, group membership on drag,
  table edit operations, stroke path simplification.
- Integration: two simulated clients over the realtime test harness see each
  other's chat, cursor messages, pins, and board objects.
- Update `canvas-dark-rollback.test.ts` when Notes return.

## Decisions

1. Comment pins sit at a canvas position; they do not follow nodes.
2. Notes and Comments were removed because deleting one reloaded the page;
   that must not happen again (see Principles).
3. Tables are a generic grid.
4. Using a sketch as a generation input is deferred.
5. Chat plays a notification sound (with mute) in addition to the badge.
