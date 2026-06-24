# Round Reveal and Planning UX Design

## Goal

ทำให้ช่วงวางคำสั่งและเปิดผลลื่นขึ้นสำหรับห้อง 2–6 คน โดยผู้เล่นเลือกเป้าหมายได้อย่างอิสระระหว่างร่างคำสั่ง เห็นสถานะของทุกคน และย้อนดูผลรอบก่อนโดยไม่บังกระดานหลัก

## Planning

- `orders:update` รับ draft ที่ยังไม่กระจายอย่างสมดุลได้ ตราบใดที่เป้าหมายและจำนวนกระสุนถูกต้อง
- ตรวจ distribution เมื่อ `orders:seal` เท่านั้น หากไม่สมดุลให้คืน `orders_distribution` โดยเก็บ draft เดิมไว้
- UI แสดงคำแนะนำจำนวนกระสุนที่ควรย้าย แต่ไม่ลบหรือเปลี่ยนคำสั่งแทนผู้เล่น
- สถานะที่นั่งใน Planning แสดง `กำลังเลือกเป้า`, `พร้อมโจมตีแล้ว`, `หลุด`, หรือ `ตกรอบ`

## Reveal Direction C

- Server จัด reveal ตามลำดับผู้ยิง และส่งทีละนัดทุก 800ms
- เมื่อเปลี่ยนผู้ยิง พักเพิ่ม 1,200ms
- UI มีเวทีกลางสำหรับนัดปัจจุบัน แสดงผู้ยิง เป้าหมาย พิกัด และผล
- นัดของผู้ยิงที่จบคิวแล้วพับเป็นบันทึกสรุปที่กางดูได้
- Planning รอบถัดไปมี `บันทึกรอบก่อน` แบบย่อ ใช้ข้อมูล reveal ล่าสุดจาก server
- ประวัติเป็นข้อมูลชั่วคราวของห้อง ไม่บันทึกลงฐานข้อมูล

## Bot Names

- Bot ใช้ชื่อแนวทะเลจากรายการคงที่ เช่น `ฉลามขาว`, `หมึกแดง`, `คลื่นคราม`
- เลือกชื่อแบบสุ่มและไม่ซ้ำกับชื่อที่มีอยู่ในห้อง หากชื่อหมดให้เติมเลขท้าย
- ระดับความยากยังแสดงแยกจากชื่อ

## Chat and Notifications

- Chat เริ่มในสถานะย่อ เป็นปุ่มลอย `แชต`
- เมื่อมีข้อความใหม่ขณะย่อ แสดง badge จำนวนที่ยังไม่ได้อ่าน
- เมื่อเปิด panel ให้ล้าง unread count และมีปุ่มย่อกลับ
- Toast error หายอัตโนมัติใน 4 วินาที และมีปุ่มปิดทันที
- Error ใหม่เริ่ม timer ใหม่

## Accessibility and Motion

- การ reveal ไม่ซ่อนข้อมูลสำคัญถ้าเปิด reduced motion แต่ลด transition และ delay เชิงภาพ
- ปุ่ม chat, toast close, log disclosure และสถานะผู้เล่นมี accessible names
- สถานะไม่พึ่งสีเพียงอย่างเดียว

## Testing

- Room manager รับ draft ที่ไม่สมดุล แต่ reject ตอน seal
- Bot names ไม่ซ้ำในห้องและไม่ใช่ `BOT EASY/NORMAL/HARD`
- Public seat state สะท้อน sealed status โดยไม่เปิดเผย orders
- Reveal ordering และ delay schedule มี player gap
- Toast auto-dismiss และ manual dismiss
- Chat collapse/unread behavior
- Planning เลือกเป้าคนเดิมหลายครั้งได้
- Reveal UI แสดง active shot, grouped completed logs และ previous-round log

