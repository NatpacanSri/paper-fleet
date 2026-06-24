# Hybrid Handwriting and Pixel Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ฝัง Mali และ Sergamon แล้วใช้ตามบทบาท typography แบบ C ที่อนุมัติ

**Architecture:** เก็บไฟล์ฟอนต์เป็น local assets และประกาศสาม semantic tokens ได้แก่ body, handwriting และ data. เปลี่ยน selector เดิมผ่าน token เป็นหลัก แล้วเพิ่ม selector เฉพาะชื่อผู้เล่นและ primary actions เท่าที่จำเป็น

**Tech Stack:** CSS, Vite assets, Vitest

---

### Task 1: Typography Contract

**Files:**
- Create: `apps/web/test/typography.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] เขียน test อ่าน CSS และยืนยัน `Mali`, `Sergamon`, `font-display: swap`, `--font-handwriting` และ `--font-data`
- [ ] รัน `pnpm --filter @paper-fleet/web test typography.test.ts` และยืนยันว่า fail เพราะ contract ยังไม่มี

### Task 2: Local Font Assets and Role Mapping

**Files:**
- Create: `apps/web/src/assets/fonts/Mali-Regular.ttf`
- Create: `apps/web/src/assets/fonts/Mali-SemiBold.ttf`
- Create: `apps/web/src/assets/fonts/Sergamon.woff2`
- Modify: `apps/web/src/styles.css`

- [ ] ดาวน์โหลด Mali 400/600 จาก Google Fonts และ Sergamon webfont จากโครงการต้นฉบับ
- [ ] เพิ่ม `@font-face` local พร้อม `font-display: swap`
- [ ] map `--font-display` ไป Mali, `--font-mono` ไป Sergamon และคง `--font-body` เดิม
- [ ] เพิ่ม Mali ให้ชื่อผู้เล่นและ primary action โดยไม่เปลี่ยน body controls ทั้งหมด
- [ ] รัน typography test และ web test ทั้งชุด

### Task 3: Verification

**Files:**
- Modify only if verification finds an in-scope typography regression.

- [ ] รัน `pnpm test`
- [ ] รัน `pnpm typecheck`
- [ ] รัน `pnpm build` และยืนยัน font assets อยู่ใน bundle
- [ ] ตรวจ Planning และ Reveal ที่ 1424px และ 390px
- [ ] ตรวจ console, horizontal overflow, heading wrapping และ Thai mark collision
