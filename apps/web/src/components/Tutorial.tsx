import { useState } from "react";

interface Props {
  onClose: () => void;
}

const steps = [
  {
    title: "วาดเกาะให้ครบ 12 ช่อง",
    copy: "เกาะติดกันเฉพาะบน–ล่าง–ซ้าย–ขวา และแบ่งได้ไม่เกินสองเกาะ",
    mark: "เกาะ",
  },
  {
    title: "ซ่อนป้อมและกองเรือ",
    copy: "ป้อมสามแห่งอยู่บนดิน เรือ 4/3/2/1/1 อยู่ในน้ำและห้ามทับกัน",
    mark: "ซ่อน",
  },
  {
    title: "เขียนคำสั่งยิงพร้อมกัน",
    copy: "กระจายกระสุนใส่คู่แข่งให้เท่ากันที่สุด แล้วปิดซองก่อนหมดเวลา",
    mark: "ยิง",
  },
  {
    title: "จำเฉพาะสิ่งที่คุณยิงโดน",
    copy: "รอยพลาดและผลของคนอื่นจะหาย กระสุนที่ตกบนดินถูกเจ้าของเกาะเก็บไปใช้รอบหน้า",
    mark: "จำ",
  },
];

export function Tutorial({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const current = steps[step]!;

  return (
    <div className="modal-backdrop">
      <section
        className="tutorial-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="สนามฝึก Paper Fleet"
      >
        <button className="modal-close" aria-label="ปิดสนามฝึก" onClick={onClose}>×</button>
        <p className="eyebrow">สนามฝึก 3–5 นาที</p>
        <div className="tutorial-grid">
          <div className={`tutorial-illustration step-${step}`}>
            <span>{current.mark}</span>
            <div className="mini-grid" aria-hidden="true">
              {Array.from({ length: 24 }, (_, index) => <i key={index} />)}
            </div>
          </div>
          <div>
            <strong className="step-count">{step + 1} / {steps.length}</strong>
            <h2>{current.title}</h2>
            <p>{current.copy}</p>
            <div className="tutorial-actions">
              <button
                className="button secondary"
                disabled={step === 0}
                onClick={() => setStep((value) => value - 1)}
              >
                ย้อนกลับ
              </button>
              {step < steps.length - 1 ? (
                <button className="button primary" onClick={() => setStep((value) => value + 1)}>
                  ต่อไป
                </button>
              ) : (
                <button className="button primary" onClick={onClose}>พร้อมออกเรือ</button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
