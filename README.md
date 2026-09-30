# 🔬 AI Wafer Inspection HMI Dashboard (Edge AI System)
### ระบบตรวจจับและวิเคราะห์ตำหนิบนแผ่น semiconductor wafer ด้วย Edge AI

---

## 📌 1. ภาพรวมระบบ (System Overview)

ระบบ **AI Wafer Inspection HMI Dashboard** ถูกพัฒนาขึ้นสำหรับการตรวจจับตำหนิแบบเรียลไทม์บนแผ่นเวเฟอร์ (Semiconductor Wafer Inspection) ในกระบวนการผลิตสารกึ่งตัวนำ โดยใช้โมเดล Deep Learning (YOLOv8-Segmentation / UNet) ในการประมวลผลบนหน่วยประมวลผลของฮาร์ดแวร์ระดับอุตสาหกรรม **NXP i.MX8M Plus** (Edge Node) ร่วมกับระบบเซิร์ฟเวอร์ศูนย์กลาง (PC Node) 

ระบบ HMI (Human-Machine Interface) นี้ได้รับการออกแบบให้มีความลื่นไหล เป็นมิตรต่อผู้ใช้งาน และรองรับหน้าจอสัมผัสในโรงงานอุตสาหกรรม พร้อมหน้าต่างควบคุม (Settings) ที่สามารถปรับแก้พารามิเตอร์ของระบบแบบ Hot-Reload ได้ทันที

---

## 🛠️ 2. สถาปัตยกรรมเทคโนโลยี (Tech Stack Architecture)

สถาปัตยกรรมของระบบแบ่งออกเป็น 3 ส่วนหลัก (3-Tier Dual-Node Architecture):

```mermaid
graph TD
    A[📷 Camera / Machine Input] -->|Raw Image File| B[🧠 NXP i.MX8 Edge AI Node - FastAPI Port 8001]
    B -->|TFLite INT8 / NPU Inference| C[⚙️ i.MX8 Rule Engine & Local DB]
    C -->|Single txt Judgement| D[📟 Prober Machine Output]
    B -->|Async HTTP JSON Sync| E[🪺 PC Central Backend - NestJS Port 3000]
    E -->|Central DB & Socket Gateway| F[🐘 PostgreSQL Central DB]
    E <-->|WebSocket & REST APIs| G[💻 Central Web HMI - React 19 Port 5173]
    B <-->|Edge Settings API| G
    G -->|Operator View| H[🔴🟡🟢 Full-Screen Color Beacon & Canvas]
    G -->|Engineer View| I[📊 Config Editor Modal & History Export]
```

### 💻 2.1 Frontend (HMI Web Dashboard)
- **React 19 + Vite 8**: สร้าง UI component ที่อัปเดตแบบเรียลไทม์ผ่าน WebSocket มีความเร็วสูงและ Hot Module Replacement
- **Vanilla CSS (Custom Design System)**: ออกแบบสไตล์เฉพาะตัวด้วย CSS Variables ควบคุมสเกล Typography (14px - 22px) และ Layout ได้สมบูรณ์ โดยไม่พึ่งพา Framework ที่มี Overhead
- **HTML5 Canvas API**: ใช้สำหรับวาดภาพถ่ายแผ่นเวเฟอร์ การวาด Bounding Box / Segmentation Masks พร้อมการคำนวณสเกลภาพแบบ 1:1

### ⚙️ 2.2 Edge AI Backend (NXP i.MX8 - FastAPI)
- **FastAPI (Python 3.10+)**: API ความเร็วสูงบนพอร์ต 8001 จัดการ Inference Pipeline, Telemetry ของ Edge Board และจัดการไฟล์ Config (Recipe/Machine)
- **PyTorch & TensorFlow Lite**: รันโมเดล Quantized INT8 บน NPU สำหรับตรวจจับ Pad, Probe Mark, และ Silicon Grain
- **OpenCV & NumPy**: จัดการ Image Processing แบบความหน่วงต่ำ

### 🪺 2.3 Central Server Backend (PC Node - NestJS)
- **NestJS (TypeScript)**: รันบนพอร์ต 3000 หน้าที่ประสานงาน (Gateway) ระหว่าง Edge Nodes หลายตัวและ HMI
- **PostgreSQL**: ฐานข้อมูล Enterprise (รันผ่าน Docker) เก็บประวัติผลตรวจจับ และสถิติการผลิต
- **SQLite (Fallback)**: ระบบฐานข้อมูลสำรองอัตโนมัติหาก PostgreSQL ดาวน์

---

## 🌟 3. ฟีเจอร์หลักของระบบ (Key Features)

1. **โหมดตรวจจับแบบไดนามิก (Model Class Architecture Manager)**:
   - ระบบจะอ่านค่าคลาสที่ตรวจจับได้จากโมเดล (`Pad + Probe Mark` 2C หรือเพิ่ม `Silicon Grain` 3C) และปรับการแสดงผลบน Canvas พร้อมตารางผลลัพธ์โดยอัตโนมัติ

2. **Full-Screen Operator Beacon & Frame-Perfect Sync**:
   - แบนเนอร์ผลลัพธ์ (PASS/WARNING/FAIL) เปลี่ยนสีพื้นหลังทั้งหน้าจอ เป็นสัญญาณไฟทางสายตา
   - Preload รูปภาพพร้อมกับการคำนวณ Bounding Box เพื่อให้การเรนเดอร์กราฟิกไม่กระตุก (No flickering)

3. **In-Browser Config Editor Modal (หน้า Settings)**:
   - ตารางรายการไฟล์ Recipe และ Machine Configuration
   - **Config Editor Modal**: เครื่องมือแก้ไขไฟล์ JSON แบบฝังในเบราว์เซอร์ พร้อมการเช็กความถูกต้อง (Valid JSON format) ปุ่ม Format JSON และระบบบันทึกแบบ Hot-Reload เข้าสู่ Runtime บน Edge ทันที
   - การจัดการเปิดใช้งานโมเดล AI (`.tflite` / `.pth`) ผ่านหน้า UI

4. **History & Analytics Export**:
   - ตารางประวัติการตรวจสอบย้อนหลังที่ดึงข้อมูลจาก Database แบบ Pagination
   - ระบบ **Export to CSV**: ดาวน์โหลดข้อมูลผลการตรวจสอบพร้อม timestamp เป็นไฟล์ Spreadsheet ชื่อไฟล์ฟอร์แมต `inspection_history_YYYY-MM-DD_HHMM.csv`

---

## 📂 4. โครงสร้างโฟลเดอร์ (Project Directory Structure)

```text
UIIU/
├── docs/                     # 📚 เอกสารเทคนิค สถาปัตยกรรม และคู่มือระบบ
├── backend_imx8/             # 🧠 [Edge AI Node] FastAPI Backend บน i.MX8 (Port 8001)
│   ├── configs/              # โฟลเดอร์เก็บ Machine & Recipe Configuration Files (JSON/TXT)
│   ├── models/               # ไฟล์โมเดล AI (เช่น best_converted_2c.tflite)
│   ├── simulation/           # ไฟล์จำลองสัญญาณจากเครื่องจักร
│   └── main.py               # จุดเริ่มรัน FastAPI Edge Server
├── backend_pc/               # 🪺 [Central Server Node] NestJS Backend บน PC (Port 3000)
│   ├── src/                  # NestJS Controllers, Services & Websocket Gateway
│   └── package.json          # Dependency ของ NestJS
├── frontend/                 # 💻 [HMI Dashboard] React 19 + Vite HMI Web App (Port 5173)
│   ├── src/
│   │   ├── components/       # UI Components เช่น ConfigEditorModal, Canvas
│   │   ├── pages/            # หน้าจอหลัก (Inspect, History, Models, Settings)
│   │   └── context/          # Context API สำหรับจัดการ State (InspectionContext)
│   └── index.html
├── datasets/                 # ข้อมูลชุดภาพสำหรับ Benchmark
├── docker/                   # การตั้งค่า Docker Container (PostgreSQL, CloudBeaver)
├── start.sh / stop.sh        # สคริปต์เปิด/ปิดระบบแบบครบวงจร
└── README.md                 # เอกสารที่คุณกำลังอ่าน
```

---

## 🚀 5. วิธีการติดตั้งและเริ่มต้นใช้งาน (Installation & Quick Start)

### ความต้องการของระบบ (Prerequisites)
- **Node.js**: v18.0.0+
- **Python**: v3.10+
- **Docker & Docker Compose**: สำหรับรัน PostgreSQL

---

### ⚡ สรุปคำสั่งเปิดใช้งานเต็มระบบ 3 ขั้นตอน

เพื่อจำลองการทำงานบนเครื่องเดียว (Development Mode) ให้เปิด Terminal 3 หน้าต่าง:

**Terminal 1: รัน Database & Central Backend (PC Node - Port 3000)**
```bash
cd /home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU
# เปิดฐานข้อมูล PostgreSQL
sudo docker compose up -d

# เปิด NestJS Server
cd backend_pc
npm install
npm run start:dev
```

**Terminal 2: รัน Edge AI Backend (i.MX8 Node - Port 8001)**
```bash
cd /home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU
# รัน FastAPI (ถ้าใช้ Virtual Environment อย่าลืม source ก่อนรัน)
.venv/bin/python3 -m uvicorn backend_imx8.main:app --host 0.0.0.0 --port 8001 --reload
```
* API Server รันที่ `http://localhost:8001` (เช็ก API Docs ได้ที่ `http://localhost:8001/docs`)

**Terminal 3: รัน HMI Frontend (React Dashboard - Port 5173)**
```bash
cd /home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/frontend
npm install
npm run dev
```
* เข้าใช้งาน Web HMI ได้ที่: 👉 **`http://localhost:5173`**

---

## 📡 6. รายการ API Endpoints (Core Interfaces)

| Component | Endpoint | Method | Protocol | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Edge Node** | `/api/sys-stats` | GET | REST | ข้อมูล Telemetry ฮาร์ดแวร์ (CPU, RAM) |
| **Edge Node** | `/api/configs/{type}` | GET/POST | REST | อ่านหรือบันทึกไฟล์ Recipe / Machine Config |
| **Edge Node** | `/api/models` | GET/POST | REST | รายการ AI Models ที่ใช้งานได้ |
| **PC Node** | `/api/history` | GET | REST | ดึงประวัติการตรวจจับจาก Database แบบ Pagination |
| **PC Node** | `/ws` | SUB | WebSocket | สตรีมมิ่งผลตรวจจับใหม่แบบเรียลไทม์ให้ Frontend |

---

## 👨‍💻 7. การพัฒนาและการจัดการ Git

โปรเจกต์นี้ถูกจัดการผ่าน GitHub Repository ผู้พัฒนาควรยึดหลักดังนี้:
- **Git Commit Standards**: ใช้ Conventional Commits เช่น `feat:`, `fix:`, `style:`, `refactor:`
- **Typography & Styling**: หากมีการแก้ไข UI ควรยึดขนาดอักษร (Typography Scale) ตามที่กำหนดไว้ใน `index.css` และควรดูความเรียบร้อยทั้งในหน้าจอขนาดเล็กและหน้าจอ HMI แบบ Full-HD (1920x1080)
- **Testing**: หากเพิ่มฟีเจอร์การคำนวณ Threshold หรือ Logic ฝั่ง Edge ต้องมีการทดสอบ Simulation เสมอ

---

## 🧠 8. เจาะลึกการทำงานของแต่ละส่วนและโครงสร้างโค้ด (Deep Dive into Components)

เพื่อให้เข้าใจการทำงานของระบบและนำไปพัฒนาต่อยอดได้ง่ายขึ้น นี่คือรายละเอียดเชิงลึกของ 3 ส่วนหลัก รวมถึงวิธีการจัดเก็บข้อมูล:

### 1. `backend_imx8` (Edge Node - ระบบประมวลผลริมขอบ)
ส่วนนี้คือ "สมองหลัก" ที่ติดตั้งอยู่บนเครื่องจักร ทำหน้าที่ประมวลผลภาพแบบเรียลไทม์
- **หน้าที่หลัก**: รัน AI Inference, ตัดสินชิ้นงาน (Pass/Fail) ตามเกณฑ์ที่ตั้งไว้, และสั่งการเครื่องจักร
- **ไฟล์โค้ดหลัก (`main.py`)**: 
  - เป็น API Server รันด้วย FastAPI (พอร์ต 8001)
  - **Inference Pipeline**: รับภาพดิบ (Raw Image) เข้ามา ส่งให้โมเดล AI (`.tflite` แบบ INT8) ที่รันด้วย NPU (Neural Processing Unit) ตรวจจับตำแหน่ง Pad, Probe Mark, และสิ่งแปลกปลอม
  - **Rule Engine**: คำนวณหาความถูกต้อง เช่น ระยะห่างขอบเขต, เปอร์เซ็นต์พื้นที่รอย 
  - **Config Management**: จัดการและอ่านไฟล์ตั้งค่าเงื่อนไขการตรวจสอบ `Product_Setting.txt` และ `Machine_Setting.txt`
- **การเก็บข้อมูล (Storage & IO)**:
  - **รูปภาพ**: `main.py` ใช้คำสั่ง `cv2.imwrite()` เพื่อบันทึกรูปภาพแบ่งเป็น 3 ประเภทลงในโฟลเดอร์ของเครื่อง:
    1. ภาพดิบ (Raw Image)
    2. ภาพที่ตีกรอบ Bounding Box แล้ว (Annotated Image)
    3. ภาพหน้าจอ Canvas ผลลัพธ์สำหรับแสดงบน HMI (Inspect Image)
  - **ผลการตัดสิน (Judgement Data)**: จะเขียนผลลัพธ์ลงเป็นไฟล์ข้อความ `.txt` เดี่ยวๆ ตามฟอร์แมตของเครื่องจักร เช่น `PASS_0000_WP269_20261012.txt` และบันทึกลงในไดเรกทอรีแชร์เพื่อให้ Prober Machine ดึงไปตัดสินใจว่าแผ่นเวเฟอร์นั้นผ่านหรือไม่

### 2. `backend_pc` (Central Server - ระบบศูนย์กลาง)
ส่วนนี้คือ "ผู้ประสานงาน" ที่ตั้งอยู่บนเซิร์ฟเวอร์ส่วนกลาง ทำหน้าที่เชื่อมระหว่างฮาร์ดแวร์ขอบ (Edge) หลายๆ ตัว กับหน้าจอแสดงผลของผู้ใช้
- **หน้าที่หลัก**: รวบรวมข้อมูล Telemetry, รับผลการตรวจจับจาก i.MX8 และ Broadcast ต่อไปยังหน้าจอ HMI
- **ไฟล์โค้ดหลัก (`src/inspections/inspections.service.ts` และ `events.gateway.ts`)**:
  - พัฒนาด้วย NestJS (พอร์ต 3000)
  - **API Gateway**: คอยรับ HTTP POST Request ข้อมูล payload ผลตรวจล่าสุดจาก `backend_imx8`
  - **WebSocket Broadcaster**: เมื่อรับข้อมูลมาแล้ว `EventsGateway` จะทำการกระจายข้อมูลการตรวจจับ (Event: `NEW_INSPECTION`) ไปยังเบราว์เซอร์ทั้งหมดที่เชื่อมต่ออยู่ทันที (Real-time update)
- **การเก็บข้อมูล (Data Persistence)**:
  - **ประวัติการทำงาน (History/Logs)**: ข้อมูลทั้งหมด เช่น รหัสชิ้นงาน, ผลการตรวจ, เวลาอนุมาน (Inference Time), และลิงก์รูปภาพ (`imageUrl`) จะถูกบันทึกเป็น Record ลงในฐานข้อมูล **PostgreSQL** ผ่าน TypeORM (มีการใช้ `SQLite` หรือ In-memory Array เป็น Fallback กรณีฐานข้อมูลหลักล่ม) เพื่อให้สามารถสืบค้นและดึงออกไปวิเคราะห์ย้อนหลังเป็น CSV ได้

### 3. `frontend` (HMI Dashboard - หน้าจอควบคุมของผู้ใช้งาน)
ส่วนนี้คือ "หน้าตาของระบบ" ที่ผู้ควบคุมเครื่อง (Operator) หรือวิศวกร (Engineer) มองเห็นผ่าน Web Browser
- **หน้าที่หลัก**: แสดงผลลัพธ์แบบเรียลไทม์ (รูปภาพ + สัญญาณไฟเตือน) และให้วิศวกรปรับแต่งระบบแบบ Hot-Reload
- **ไฟล์โค้ดหลัก (`src/`)**:
  - รันด้วย React 19 และ Vite (พอร์ต 5173)
  - **`context/InspectionContext.jsx`**: เป็นเส้นเลือดใหญ่ของฝั่งหน้าจอ คอยจัดการ State, จัดการเชื่อมต่อ WebSocket กับ `backend_pc`, และส่งคำสั่ง API ไปที่ `backend_imx8`
  - **`pages/SettingsPage.jsx` และ `components/ConfigEditorModal.jsx`**: เป็นหน้าจอสำหรับจัดการไฟล์ Config (Recipe/Machine) วิศวกรสามารถกดเปิดไฟล์ JSON มาแก้ไข กดยืนยัน (Format JSON) และกด `Save & Activate` ระบบจะส่งข้อมูลไปเซฟทับไฟล์ที่เครื่อง i.MX8 และบังคับให้ AI โหลดค่าใหม่ทันทีโดยไม่ต้องรีบูตเครื่อง (Hot Reload)
  - **UI/UX & Graphics**: ใช้ `HTML5 Canvas API` ในการซ้อน (Overlay) รูปภาพและ Bounding Box ให้เข้ากันแบบ 1:1 (Frame-Perfect) และสามารถกระพริบเปลี่ยนสีฉากหลังทั้งหมด (สีเขียว/แดง) ตามผลลัพธ์เพื่อเป็นสัญญาณไฟเตือนจากระยะไกลให้ Operator มองเห็นได้ชัดเจน

*© 2026 NXP Semiconductors & Project Team. All Rights Reserved.*
