# Hybrid Handwriting and Pixel Typography Design

## Direction

ใช้ typography แบบผสมเพื่อรักษาทั้งบุคลิกสมุดวาดมือและข้อมูลยุทธการแบบเกมคอมเก่า

- `Mali`: หัวเรื่อง ชื่อผู้เล่น และ action สำคัญ
- `Sergamon`: โลโก้ รอบ เวลา สถานะ กระสุน ลำดับ และพิกัด
- `Tahoma / Noto Sans Thai`: body text, chat, form และข้อความอธิบาย

## Delivery

- ฝังไฟล์ฟอนต์ไว้ใน `apps/web/src/assets/fonts` โดยใช้ Sergamon ซึ่งรองรับไทยและอนุญาตให้เผยแพร่ผ่านเว็บภายใต้ SIL OFL 1.1
- ใช้ `@font-face` พร้อม `font-display: swap`
- มี fallback ที่เข้ากับบทบาทแต่ละชุด
- ไม่เปลี่ยนขนาดกระดานหรือโครง layout

## Validation

- CSS test ยืนยัน asset และ typography tokens
- Build ต้อง bundle ฟอนต์ทั้งสอง family
- ตรวจ Planning และ Reveal บน desktop และ mobile
- ตรวจวรรณยุกต์ไทยไม่ชน ไม่มี horizontal overflow และ console ไม่มี error
