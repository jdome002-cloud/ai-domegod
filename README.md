# AI DOMEgod

เว็บแชท AI (เขียนโค้ด + ช่วยงานทั่วไป) ภาษาไทย ติดตั้งลงหน้าจอ iPhone/Android ได้แบบแอป (PWA)

โปรเจกต์นี้แยกจาก HAHA SHOP โดยสมบูรณ์

ค่าเริ่มต้นใช้ **Groq** (API ฟรี ที่เข้ากันได้กับ OpenAI) โมเดลเริ่มต้นคือ `openai/gpt-oss-120b` ซึ่งเป็นรุ่นที่ Groq แนะนำแทน `llama-3.3-70b-versatile` (รุ่นนั้นเลิกให้ในแพ็กฟรีแล้วตั้งแต่ ส.ค. 2026) เปลี่ยนรุ่นได้ด้วย `GROQ_MODEL`

## รันบนเครื่อง

ต้องใช้ Node 22

```bash
cd /workspace/ai-domegod
npm install
node server.js
```

เปิด http://localhost:3000

ถ้ายังไม่ได้ตั้ง `GROQ_API_KEY` แอปจะเปิดได้ปกติ แต่เมื่อส่งข้อความจะได้รับคำตอบว่ายังไม่ได้ตั้งค่า AI ฟรี

```bash
export GROQ_API_KEY="..."   # รับ key ฟรีที่ https://console.groq.com — อย่าใส่คีย์ในไฟล์หรือในโค้ด
node server.js
```

คีย์ถูกอ่านจาก environment เท่านั้น ไม่ถูกส่งไปที่เบราว์เซอร์ และไม่ถูกเขียนลงล็อก

ถ้าต้องการใช้ OpenAI แทน ให้ตั้ง `AI_PROVIDER=openai` และ `OPENAI_API_KEY` (จะใช้ก็ต่อเมื่อไม่มี `GROQ_API_KEY`)

## ติดตั้งลงมือถือ

- **iPhone:** เปิดเว็บใน Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม
- **Android:** เปิดใน Chrome แล้วกดติดตั้งแอป / เพิ่มไปยังหน้าจอหลัก

## เส้นทางสำคัญ

- `GET /` หน้าแชท
- `GET /healthz` ตรวจสุขภาพเซิร์ฟเวอร์
- `POST /api/chat` ส่งประวัติข้อความไปยัง Groq (ค่าเริ่มต้น) หรือ OpenAI (เมื่อตั้งค่า fallback)

## สิ่งที่ต้องทำต่อเพื่อขึ้นเว็บจริง

1. สร้างรีโป GitHub แล้ว push โค้ดนี้ขึ้นไป
2. Deploy เป็น Render web service (ใช้ `render.yaml` ได้)
3. ใส่ `GROQ_API_KEY` ใน Environment ของ Render (อย่าใส่ในโค้ด)
