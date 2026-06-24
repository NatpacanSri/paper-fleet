# Paper Fleet

เกมเรือรบออนไลน์ภาษาไทยสำหรับ 2–6 ที่นั่ง วางคำสั่งพร้อมกัน ใช้ข้อมูลแบบจำกัด
และเติม Bot ระดับ Easy, Normal หรือ Hard ได้

## เริ่มใช้งาน

ต้องมี Node.js 20+ และ pnpm

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:5173
- Server health: http://localhost:3001/health

หาก server อยู่คนละ origin ให้ตั้งค่า:

```bash
VITE_SERVER_URL=https://your-server.example pnpm --filter @paper-fleet/web build
```

## คำสั่งตรวจสอบ

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Production

หลัง `pnpm build` แล้ว server จะเสิร์ฟไฟล์เว็บจาก `apps/web/dist` พร้อม Socket.IO ใน origin เดียวกัน:

```bash
pnpm build
PORT=3001 pnpm start
```

ถ้าใช้ host ที่แยก web/server คนละ origin ให้ build web พร้อม `VITE_SERVER_URL`
ชี้ไปที่ server URL:

```bash
VITE_SERVER_URL=https://your-server.example pnpm --filter @paper-fleet/web build
```

## โครงสร้าง

- `packages/game-core` — กติกา, validation, round resolution, privacy filter และ Bot
- `apps/server` — ห้องชั่วคราวใน memory และ authoritative Socket.IO server
- `apps/web` — React/Vite UI แบบสมุดยุทธการบนกระดาษ

ห้องและเกมจะหายเมื่อ server restart ตามขอบเขต MVP
