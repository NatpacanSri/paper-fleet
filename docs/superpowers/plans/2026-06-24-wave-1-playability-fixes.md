# Wave 1 Playability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the highest-impact playability issues before deeper scoring/replay work.

**Architecture:** Keep the current monorepo shape. Add small server events/state helpers in `RoomManager` and `socket-server`, then surface them through existing React screens. Avoid database/storage changes in this wave.

**Tech Stack:** TypeScript, React, Vite, Socket.IO, Vitest, Render.

---

### Task 1: Table leave removes the seat

**Files:**
- Modify: `apps/server/src/room-manager.ts`
- Modify: `apps/server/src/socket-server.ts`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/server/test/room-manager.test.ts`

- [x] Write a failing test that `leaveRoom(roomCode, playerId)` removes the player's seat and promotes host when needed.
- [x] Add `RoomManager.leaveRoom` to delete the player, token, disconnect/takeover state, and host pointer.
- [x] Add Socket.IO event `room:leave`.
- [x] Change the web `leave` handler to emit `room:leave` before clearing local session.

### Task 2: Timeout closes planning and resolves automatically

**Files:**
- Modify: `apps/server/src/room-manager.ts`
- Modify: `apps/server/src/socket-server.ts`
- Test: `apps/server/test/socket-server.test.ts`

- [x] Write a failing test that `tick()` reports resolved rooms when the deadline passes.
- [x] Reuse the existing server tick loop and return resolved/updated room codes.
- [x] Broadcast reveal/salvage snapshots for rooms resolved by timeout.
- [x] On timeout, seal/resolve with existing orders; unused ammo is lost by existing order rules.

### Task 3: Planning buttons and layout state

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/planning.test.tsx`

- [x] Write tests for button wording and incomplete order disabled state.
- [x] Disable `พร้อมโจมตี` until orders are complete and distribution is fair.
- [x] Show status labels after clicking.
- [x] Move opponent/player selection controls to the right side by CSS grid order.

### Task 4: Product typography and input caret

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/typography.test.ts`

- [x] Write tests that Thai labels do not use the pixel font.
- [x] Restrict pixel font in planning status copy.
- [x] Add visible `caret-color` for inputs.

### Task 5: Verification and deploy

**Files:**
- No code-only files.

- [x] Run `pnpm -r test`.
- [x] Run `pnpm -r typecheck`.
- [x] Run `pnpm -r build`.
- [ ] Commit and push.
- [ ] Trigger Render manual deploy.
- [ ] Verify `/health`, latest public asset, and basic create/join flow.
