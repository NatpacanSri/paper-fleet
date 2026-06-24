# Round Reveal and Planning UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับ Planning, Reveal, chat, toast, bot names และ player status ตาม design ที่อนุมัติ

**Architecture:** เพิ่มสถานะ `sealed` ใน public seat view, เก็บ previous reveal ใน room state และย้าย distribution validation ไปที่ seal boundary. ฝั่ง web แยก UI helpers สำหรับ toast, chat และ grouped reveal โดยใช้ state จาก snapshot/events เดิม ไม่เพิ่ม dependency.

**Tech Stack:** TypeScript, React 19, Socket.IO, Vitest, Testing Library, CSS

---

### Task 1: Draft Orders and Player Status

**Files:**
- Modify: `packages/game-core/src/types.ts`
- Modify: `packages/game-core/src/engine.ts`
- Modify: `apps/server/src/room-manager.ts`
- Test: `apps/server/test/room-manager.test.ts`
- Test: `packages/game-core/test/game-engine.test.ts`

- [ ] Write failing tests proving uneven drafts are accepted, uneven seal is rejected, and public seats expose `sealed`.
- [ ] Run `pnpm --filter @paper-fleet/server test` and `pnpm --filter @paper-fleet/game-core test`; confirm failures describe current behavior.
- [ ] Add optional public `sealed` seat state, remove distribution validation from `updateOrders`, and validate it in `sealOrders`.
- [ ] Keep the draft unchanged when sealing fails.
- [ ] Run both test suites and confirm they pass.

### Task 2: Random Bot Names

**Files:**
- Modify: `apps/server/src/room-manager.ts`
- Test: `apps/server/test/room-manager.test.ts`

- [ ] Write a failing test adding multiple bots and asserting unique thematic names with difficulty stored separately.
- [ ] Run the focused server test and confirm it fails on `BOT EASY`.
- [ ] Add a fixed bot-name pool, select using injected randomness, skip occupied names, and add numeric suffix fallback.
- [ ] Run server tests and confirm they pass.

### Task 3: Reveal History and Timing

**Files:**
- Modify: `packages/game-core/src/types.ts`
- Modify: `packages/game-core/src/engine.ts`
- Modify: `apps/server/src/room-manager.ts`
- Modify: `apps/server/src/socket-server.ts`
- Test: `packages/game-core/test/game-engine.test.ts`
- Test: `apps/server/test/socket-server.test.ts`

- [ ] Write failing tests for `previousReveal`, attacker-grouped reveal order, 800ms shot cadence, and 1,200ms attacker gap.
- [ ] Run focused tests and confirm failures.
- [ ] Preserve the completed reveal when beginning the next Planning phase.
- [ ] Group resolved orders by seat order and schedule socket events with cumulative shot and player-gap delays.
- [ ] Keep test-configurable timing while changing production defaults to 800ms and 1,200ms.
- [ ] Run core and server tests.

### Task 4: Planning and Reveal UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/planning.test.tsx`
- Create: `apps/web/test/reveal.test.tsx`

- [ ] Write failing tests for repeated same-opponent selections, seal-only validation feedback, public player statuses, active reveal stage, completed attacker logs, and previous-round disclosure.
- [ ] Run web tests and confirm failures.
- [ ] Allow every valid draft click to sync; disable seal only for ammo completeness, not draft distribution.
- [ ] On failed seal show a specific balancing hint while preserving orders.
- [ ] Render opponent status text from `sealed`, `connected`, and `eliminated`.
- [ ] Implement Reveal direction C with current-shot stage and grouped completed logs.
- [ ] Add previous-round log disclosure to Planning.
- [ ] Run web tests.

### Task 5: Toast and Collapsible Chat

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/app.test.tsx`

- [ ] Write failing fake-timer tests for toast auto-dismiss after 4 seconds and manual close.
- [ ] Write failing interaction tests for collapsed chat, unread badge, opening, and minimizing.
- [ ] Run focused web tests and confirm failures.
- [ ] Add an error timeout effect that resets on each error and a close button that clears error.
- [ ] Make chat collapsed by default, increment unread only while closed, clear unread on open, and retain reactions inside the panel.
- [ ] Add responsive styles that keep the collapsed control clear of gameplay.
- [ ] Run web tests.

### Task 6: End-to-End Verification

**Files:**
- Modify only if verification reveals an in-scope regression.

- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] In the browser, verify a room with two bots: random names, repeated target drafting, seal validation, visible ready statuses, paced reveal, previous log, collapsible chat, and disappearing toast.
- [ ] Verify no console errors and no horizontal overflow at desktop and mobile widths.

