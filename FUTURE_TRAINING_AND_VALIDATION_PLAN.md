# 📑 แผนงานการพัฒนาในอนาคต: PC-Based PyTorch 4-Class U-Net Training & Validation Workbench

> [!NOTE]
> เอกสารฉบับนี้เป็นแผนงานการออกแบบทางเทคนิค (Implementation Plan) ที่บันทึกไว้อ้างอิงสำหรับอนาคต เมื่อผู้ใช้ต้องการสั่งเริ่มพัฒนาฟีเจอร์ระบบเทรนโมเดลและระบบทดสอบวัดผลบน PC Server

---

## 🎯 1. สรุปภาพรวมและเป้าหมาย (Goal & Architecture Overview)

ระบบที่จะพัฒนาในอนาคตประกอบด้วย 2 ส่วนหลักที่รันบน **PC Server (GPU/CPU Power)**:
1. **Model & Rule Validation Lab (ระบบทดสอบวัดผลก่อนใช้งานจริง):**  
   เปิดให้วิศวกรอัปโหลดภาพทดสอบ + ไฟล์เฉลย (Ground Truth) เพื่อรัน Benchmark วัดความแม่นยำของโมเดล (`Pixel Acc`, `mIoU`) และ Rule Engine (`Yield`, `Overkill`, `Underkill`) ก่อนนำไปใช้งานจริง
2. **PyTorch U-Net 4-Class Training Studio (ระบบเทรนโมเดลผ่าน Web UI):**  
   เปิดให้วิศวกรสั่งเทรนโมเดล PyTorch U-Net (4 คลาส) ผ่านหน้าเว็บ โดยมีการสรีมกราฟ `Loss`, `Accuracy`, และ `mIoU` เรียลไทม์ผ่าน WebSocket

---

## 🏷️ 2. โครงสร้าง 4 คลาสของโมเดล PyTorch U-Net (Segmentation Classes)

| Class ID | Class Name | Color Code | Description |
|:---:|---|:---:|---|
| **0** | `Background` (BG) | `[0, 0, 0]` | พื้นหลังชิป / โครงสร้างตัวถัง |
| **1** | `Pad` | `[0, 120, 255]` | พื้นที่แผ่นโลหะรองรับการกดเข็ม |
| **2** | `Probemark` | `[0, 255, 0]` | รอยกดของเข็มวัด (Probe Mark) |
| **3** | `Grain` | `[255, 0, 0]` | ผลึกโลหะ / รอยเกรนบนผิว Pad |

---

## 🧩 3. ส่วนประกอบโค้ดจาก `CASE_UNET` ที่จะนำมาปรับใช้

จะนำสคริปต์จาก `/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/src/unet/` มาบูรณาการเข้ากับ PC Backend:

1. **[model.py](file:///home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/src/unet/model.py):** สถาปัตยกรรม PyTorch UNet (n_channels=3, n_classes=4)
2. **[json_to_mask.py](file:///home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/src/unet/json_to_mask.py):** แปลงไฟล์วาด Polygon (Labelme / VGG JSON) ให้เป็น Mask PNG (4 คลาส)
3. **[dataset.py](file:///home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/src/unet/dataset.py):** อ่านรูปภาพและ Mask เข้า DataLoader พร้อม Data Augmentation
4. **[train.py](file:///home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/src/unet/train.py):** Engine เทรนโมเดล พร้อม Class Weights แก้ปัญหา Imbalance, บันทึก Checkpoint `.pth`, และเซฟสถิติลง `history.json`

---

## 📐 4. การออกแบบหน้าเว็บ (Frontend Web UI Components)

เพิ่มแท็บใหม่ใน `frontend/src/App.jsx` ชื่อ **`AI MODEL & RULE LAB`** แบ่งเป็น 2 Sub-Tabs:

### Sub-Tab 1: Validation & Benchmark Lab
- **Upload Component:** Drag & Drop โฟลเดอร์ภาพทดสอบ + JSON/PNG Mask Labels
- **Config Selectors:** เลือกไฟล์โมเดล `.pth` / `.tflite` และปรับแต่ง Rule Config (Edge limit, Area threshold)
- **Benchmark Summary Card:**
  - **Model Metrics:** Pixel Accuracy (%), mIoU (%), Inference Time (ms)
  - **Rule Metrics:** Yield Rate (%), False Alarm / Overkill Rate (%)
- **Discrepancy Inspector:** ตารางเปรียบเทียบผลลัพธ์ภาพที่ AI หรือ Rule Engine ตัดสินผิดพลาด เพื่อคลิกดู visual overlay

### Sub-Tab 2: PyTorch U-Net Training Studio
- **Hyperparameter Panel:**
  - `Epochs` (default: 50)
  - `Batch Size` (default: 8)
  - `Learning Rate` (default: 0.001)
  - `Image Size` (256x256 / 512x512)
- **Control Buttons:** `[ START TRAINING ]` | `[ STOP TRAINING ]` | `[ EXPORT TFLITE ]`
- **Real-time Training Monitor:** กราฟ WebSocket สตรีมค่า `train_loss`, `val_loss`, `val_miou` แบบเรียลไทม์ทุก Epoch

---

## 🛠️ 5. รายละเอียดการเปลี่ยนแปลงฝั่ง Backend (PC Backend API)

### 1️⃣ เพิ่ม REST Endpoints ใน PC Backend (`backend_pc/` หรือ FastAPI on PC):
- `POST /api/lab/train/start` — สั่งรัน `train.py` ผ่าน `subprocess.Popen` บน PC GPU
- `POST /api/lab/train/stop` — สั่งหยุดกระบวนการเทรน
- `GET /api/lab/train/status` — เช็คสถานะการเทรนปัจจุบัน
- `POST /api/lab/benchmark/run` — รันการทดสอบภาพ Offline กับโมเดลและ Rule Engine
- `POST /api/lab/convert-tflite` — แปลงโมเดล PyTorch `.pth` เป็น `.tflite` สำหรับนำไปลงบอร์ด i.MX8 NPU

### 2️⃣ เพิ่ม WebSocket Stream:
- `WS /ws/training-progress` — สตรีมค่าสถิติจาก `history.json` ไปอัปเดตกราฟบน Web UI เรียลไทม์

---

## 🧪 6. แผนการตรวจสอบความถูกต้อง (Verification Plan)

1. **Unit Test - 4-Class Training:**  
   ทดสอบรัน `train.py` ด้วย 4 คลาส (`BG`, `pad`, `probemark`, `grain`) บน PC Server ตรวจสอบว่าโมเดลสร้างไฟล์ `.pth` และ `history.json` ได้สมบูรณ์
2. **Offline Benchmark Test:**  
   ทดสอบป้อนภาพ 20 ภาพพร้อมไฟล์เฉลย ตรวจสอบว่าระบบคำนวณ mIoU และ Confusion Matrix ได้ถูกต้อง
3. **TFLite Conversion Check:**  
   ทดสอบแปลง `.pth` ➔ `.onnx` ➔ `.tflite` และนำไปวางในบอร์ด i.MX8 เพื่อตรวจสอบว่า NPU รัน Inference ได้ปกติ
