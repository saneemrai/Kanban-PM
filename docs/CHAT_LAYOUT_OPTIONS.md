# Chat layout options

The current layout places the five-column Kanban board and a fixed-width chat sidebar in the same horizontal grid. On normal desktop widths, this leaves too little space for five columns, so cards become narrow and controls such as `Remove` look awkward.

## Goals

- Keep all five Kanban columns readable.
- Keep card actions inside the card boundary.
- Keep chat available without making the board feel cramped.
- Preserve the existing MVP behavior and avoid extra chat features.
- Work cleanly on laptop, desktop, and mobile widths.

## Option 1: Right Slide-Out Chat Panel

Place the Kanban board full width by default. Add a compact `Chat` button in the header that opens a fixed right-side panel over the page.

Behavior:
- Board always uses the full content width.
- Chat opens as a right drawer with a backdrop or subtle page overlay.
- On desktop, the drawer can be around `380px`.
- On mobile, the drawer takes the full viewport width.
- Closing the drawer returns to the full-width board.

Pros:
- Best board readability.
- Columns no longer shrink because of chat.
- Familiar interaction pattern.
- Works well for MVP chat because users only need chat when actively asking for help.

Cons:
- Chat is not always visible.
- Requires a small open/close state and button.

Recommended: Yes.

## Option 2: Bottom Chat Panel

Keep the board full width and place chat below the board as a full-width panel.

Behavior:
- Board appears first.
- Chat sits under the columns.
- On mobile, this is naturally stacked.

Pros:
- Very simple layout.
- No overlay state.
- Board remains full width.

Cons:
- Chat may be far below the current viewport.
- Less convenient during board edits.
- Long boards make the chat harder to reach.

Recommended: Acceptable fallback, but less ergonomic.

## Option 3: Collapsible Inline Sidebar

Keep the current right-side chat position, but make it collapsible. When collapsed, it becomes a narrow rail; when expanded, it takes a fixed width and the board may scroll horizontally.

Behavior:
- Board area gets horizontal overflow if the chat is open.
- Columns use minimum widths instead of shrinking.
- Chat can collapse to restore more board space.

Pros:
- Chat can stay visually attached to the board.
- Columns can keep a sane minimum width.

Cons:
- Horizontal board scrolling is more complex.
- The page may feel busier.
- More layout states to test.

Recommended: Not for MVP unless always-visible chat is required.

## Option 4: Tabbed Workspace

Use tabs or segmented controls for `Board` and `AI Chat`.

Behavior:
- `Board` tab shows full-width board.
- `AI Chat` tab shows chat.
- AI board updates still apply in the background.

Pros:
- Very clean on small screens.
- Simple visual separation.

Cons:
- User cannot see chat and board at the same time.
- Less suitable for commands that change visible cards.

Recommended: Better for mobile-only, not ideal for desktop MVP.

## Card Control Fix

Regardless of chat placement, card actions should not be able to overflow narrow cards.

Recommended card adjustment:
- Let the card content and action wrap cleanly.
- Keep the title/details area at `min-width: 0`.
- Keep `Remove` as a compact action aligned inside the card.
- On very narrow cards, allow the action row to wrap below the text.

This is still needed because columns may become narrow on small screens even after moving chat.

## Recommended Plan

Implement Option 1: a right slide-out chat panel.

Detailed changes:

1. Restore the board to a full-width five-column grid on desktop.
2. Move `AiChatSidebar` out of the board grid.
3. Add a header `Chat` button that opens the panel.
4. Render the chat as a fixed right-side panel above the board.
5. Use full-width chat on mobile.
6. Add a close button in the chat panel header.
7. Adjust card layout so `Remove` stays inside the card even at narrow widths.
8. Update component and Playwright tests to open chat before sending a message.
9. Use Playwright screenshots or browser checks at desktop and mobile sizes before calling the layout complete.

Success criteria:

- The five columns are readable on desktop with chat closed.
- Opening chat does not shrink the columns.
- `Remove` stays inside each card.
- AI chat can still send a message and apply a board update.
- Existing Kanban interactions still pass.
