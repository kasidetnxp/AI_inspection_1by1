# สถาปัตยกรรมระบบการประมวลผลแบบ 1:N สำหรับระบบตรวจสอบเวเฟอร์อัตโนมัติ
## (Multi-Machine 1:N AI Inspection System Architecture & Scaling Plan)

**สถานะเอกสาร:** Draft / Planning  
**วันที่บันทึก:** 2026-09-28  
**ผู้จัดทำ:** AI System Architecture Team  
**ขอบเขต:** ระบบตรวจจับ Wafer Die/Pad และ Probe Mark Inspection (PMI)  

---

## 1. บทนำและที่มา (Background & Motivation)

### 1.1 ปัจจุบัน (1:1 Edge Architecture)
* **โครงสร้าง:** บอร์ดประมวลผล Edge AI (NXP i.MX8M Plus) จำนวน 1 บอร์ด ติดตั้งประกบกับเครื่อง Prober จำนวน 1 เครื่องแบบเด็ดขาด (1:1)
* **การทำงาน:** แต่ละบอร์ดถือไฟล์คอนฟิก `Machine_Setting.txt` และ `Product_Setting.txt` ของเครื่องนั้นๆ และอ่านเขียนไฟล์ผ่าน Drive N / Drive M ของเครื่องนั้น
* **ข้อดี:** ทำงานแยกกันอิสระ (Fault Isolation) เครื่องใดเครื่องหนึ่งมีปัญหาไม่กระทบเครื่องอื่น
* **ข้อจำกัด:** ต้นทุนฮาร์ดแวร์บอร์ดต่อจำนวนเครื่อง และยากต่อการบริหารจัดการจากส่วนกลางเมื่อขยายจำนวนเครื่องจักร (Scale-out)

### 1.2 เป้าหมายในอนาคต (1:N Centralized / Clustered Architecture)
* **โครงสร้าง:** เซิร์ฟเวอร์หรือ AI Worker กลาง 1 เครื่อง (หรือ 1 คลัสเตอร์) รองรับการประมวลผลภาพจากเครื่อง Prober พร้อมกัน $N$ เครื่อง (เช่น WP269, WP288, WP289, WP290, ...)
* **ความท้าทายหลัก:**
  1. **Data & State Confusion:** ทำอย่างไรไม่ให้ข้อมูล ผลลัพธ์ หรือคอนฟิกของแต่ละเครื่องจักรปะปนกัน
  2. **Tact Time & Timeout:** เครื่อง Prober มี Timeout กำกับ (เช่น 10 วินาที) ทำอย่างไรให้จัดคิวได้ยุติธรรม ไม่เกิดการรอนานจนเครื่องจักรค้าง (Starvation)
  3. **Data Routing & History:** การจัดเก็บและดึงข้อมูล/ภาพย้อนหลังข้ามเครื่องจักรอย่างถูกต้องแม่นยำ

---

## 2. การจัดการไม่ให้ระบบสับสน (Context Isolation & Stateless Workers)

สาเหตุหลักที่ระบบ 1:N สับสน มักเกิดจากการใช้ **Global State ร่วมกัน** (เช่น ตัวแปรกลางตัวเดียวในระดับโมดูล) การแก้ไขต้องยึดหลักการดังนี้:

### 2.1 กำจัด Single Global State เปลี่ยนเป็น Machine Registry
แทนที่จะใช้ตัวแปรเดี่ยว เช่น `ACTIVE_MACHINE_SETTING` ให้แปลงเป็น **Multi-Tenant Registry**:

```python
# โครงสร้างคอนฟิกและสถานะแยกตาม Machine ID ชัดเจน
MACHINE_REGISTRY = {
    "WP269": {
        "machine_name": "WP269",
        "active_recipe": "PRODUCT_SETUP_A",
        "machine_setting": {
            "source_folder": "/mnt/N/WP269/PMI/IMAGE",
            "judge_folder": "/mnt/N/WP269/PMI/JUDGE",
            "output_folder": "/mnt/M/WP269/PMI/OUTPUT/{lotNo}",
            "timeout_ms": 10000
        },
        "product_setting": { ... },
        "current_lot": "C3D323",
        "state": { "status": "INSPECTING", "count": 1420 }
    },
    "WP288": {
        "machine_name": "WP288",
        "active_recipe": "PRODUCT_SETUP_B",
        "machine_setting": { ... },
        "product_setting": { ... },
        "current_lot": "B4E991",
        "state": { "status": "IDLE", "count": 890 }
    }
}
```

### 2.2 Task Payload แบบสมบูรณ์ในตัว (Self-Contained / Context-Carrying Job)
เมื่อ Folder Watcher ตรวจพบภาพใหม่จากเครื่องจักรใด งานที่ส่งเข้าคิวจะต้องมี Metadata ติดตัวครบถ้วน ห้ามให้ Worker ไปเดาหรืออ่านจาก Global State:

```json
{
  "job_id": "job_20260928_140501_9912",
  "machine_id": "WP269",
  "lot_no": "C3D323",
  "wafer_no": "W18",
  "die_coord": "X60Y73",
  "pad_no": "P10",
  "image_path": "/mnt/N/WP269/PMI/IMAGE/20230614102604_C3D323W18D4_X60Y73_S3_P10_PO_CF1561CCAA-V7011_1250.bmp",
  "recipe_id": "PRODUCT_SETUP_A",
  "submitted_at": 1790578000.123
}
```

### 2.3 AI Worker แบบ Stateless (ไร้สถานะ)
ตัว AI Inference Engine และ Rule Engine จะทำตัวเสมือน **"ฟังก์ชันบริสุทธิ์ (Pure Function)"**:
1. รับ `job` เข้ามา
2. ดึง Rule และเกณฑ์ Threshold ตาม `recipe_id` ของเครื่องนั้น
3. ประมวลผลภาพ (UNet Pad/Mark/Grain Segmentation + Boundary Distance Check)
4. ส่งผลการตัดสิน (Judgment Result) ตรงไปยังโฟลเดอร์ของเครื่องนั้น: `N:\{job.machine_id}\PMI\JUDGE\...`
5. บันทึกภาพ Output ไปยัง: `M:\{job.machine_id}\PMI\OUTPUT\{job.lot_no}\...`
6. ไม่มีการเก็บค้างสถานะของเครื่องนั้นไว้ในตัว Worker

---

## 3. สถาปัตยกรรมการจัดคิว (Queue & Scheduling Strategy)

```
[ Prober WP269 ] ──(ภาพเข้า)──> [ Queue WP269 ] ──┐
[ Prober WP288 ] ──(ภาพเข้า)──> [ Queue WP288 ] ──┼──> [ Fair Scheduler ] ──> [ AI Worker Pool ] ──> [ Write Judge & DB ]
[ Prober WP290 ] ──(ภาพเข้า)──> [ Queue WP290 ] ──┘     (Round-Robin)          (GPU / NPU Batch)
```

### 3.1 ความเสี่ยงของ Single FIFO Queue
* ถ้าใช้คิวเดียวแบบ First-In-First-Out หากเครื่อง WP269 ยิงเบิร์สเข้ามา 30 รูป ขณะที่เครื่อง WP288 ส่งมา 1 รูป
* ภาพของ WP288 จะต้องรอจนกว่าภาพทั้ง 30 รูปของ WP269 จะตรวจเสร็จ
* ส่งผลให้ **WP288 เกิด Prober Timeout (> 10 วินาที) ทำให้เครื่องจักรหยุดทำงาน (Line Stop)**

### 3.2 ทางออก: Multi-Tenant Fair Queuing (Round-Robin / Deficit Round-Robin)
1. **แยก Queue ย่อยตาม Machine ID:** แต่ละเครื่องมีคิวรับงานของตัวเอง
2. **Fair Scheduler:** ตัวแจกงานจะดึงสลับกันทีละ 1 ชิ้นจากแต่ละเครื่อง:
   $$\text{Job}_{\text{WP269}} \longrightarrow \text{Job}_{\text{WP288}} \longrightarrow \text{Job}_{\text{WP290}} \longrightarrow \text{Job}_{\text{WP269}} \dots$$
3. **Priority & SLA Enforcement:**
   * สามารถแทรก Priority ให้กับชิ้นงานที่ใกล้ครบเวลา Tact Time Timeout
4. **เทคโนโลยีการทำคิว:**
   * **ระดับเริ่มต้น / Single Process:** ใช้ `asyncio.Queue` หรือ `multiprocessing.Queue` แยกตาม Machine ID
   * **ระดับ Production / Distributed:** ใช้ **Redis List / Redis Streams** หรือ **RabbitMQ** ควบคู่กับ **Celery Workers**

---

## 4. โครงสร้าง Network Drive และการเรียกดูประวัติ (Drive Layout & History)

### 4.1 มาตรฐาน Path Template (Dynamic Substitutions)
กำหนดให้ Path ทั้งหมดในระบบรองรับตัวแปร `{machine}` และ `{lotNo}`:
* **Input / Source:** `N:\{machine}\PMI\IMAGE`
* **Judge Output:** `N:\{machine}\PMI\JUDGE`
* **Processed Backup:** `M:\{machine}\PMI\PROCESSED\{lotNo}`
* **Output / Annotated:** `M:\{machine}\PMI\OUTPUT\{lotNo}`

### 4.2 การดึงภาพย้อนหลัง (History Image Retrieval)
เพื่อให้ API ดึงภาพประวัติของทุกเครื่องจักรได้อย่างถูกต้อง:
1. **API Endpoints:**
   * `/api/images/annotated/{lot_no}/{filename}?machine={machine_id}`
   * `/api/images/raw/{lot_no}/{filename}?machine={machine_id}`
   * `/api/images/comparison/{lot_no}/{filename}?machine={machine_id}`
2. **Auto Cross-Machine Fallback:**
   * หาก Request ไม่ได้ส่ง `machine` มา:
     1. ค้นหาในโฟลเดอร์ของเครื่องปัจจุบันก่อน
     2. หากไม่พบ ให้ค้นหาในไดเรกทอรีพี่น้องใต้ Drive M (`/mnt/M/*/PMI/OUTPUT/{lot_no}/`)
     3. หากพบที่เครื่องใด ให้ตอบกลับภาพนั้นทันที

### 4.3 Database Schema รองรับ Multi-Machine
ใน PostgreSQL ตาราง `inspections` ต้องมี:
* คอลัมน์ `machine_no VARCHAR(50)` ที่ห้ามเป็น NULL
* สร้าง Index เพื่อรองรับการค้นหาย้อนหลังแบบระบุเครื่องจักร:
  ```sql
  CREATE INDEX idx_inspections_machine_timestamp ON inspections (machine_no, timestamp DESC);
  CREATE INDEX idx_inspections_machine_lot ON inspections (machine_no, wafer_id);
  ```

---

## 5. การแสดงผลหน้าเว็บและระบบ WebSocket (Frontend Architecture)

```
                       ┌──> WebSocket Client (Station Tablet WP269) ──> ws://.../ws?machine=WP269
[ Central Server ] ────┼──> WebSocket Client (Station Tablet WP288) ──> ws://.../ws?machine=WP288
                       └──> WebSocket Client (Central Command Room)  ──> ws://.../ws?machine=ALL
```

### 5.1 WebSocket Channeling / Rooms
* **หน้าจอประจำเครื่องจักร (Station HMI Tablet):**
  * ต่อ WebSocket พร้อมพารามิเตอร์: `ws://server:8001/ws?machine=WP269`
  * รับเฉพาะผลตรวจ, กราฟ, และ Alarm ของเครื่อง `WP269` เท่านั้น จอจะไม่กระตุกจากข้อมูลเครื่องอื่น
* **หน้าจอกลางโรงงาน (Central Supervisor Dashboard):**
  * ต่อ WebSocket: `ws://server:8001/ws?machine=ALL`
  * มีเมนู Dropdown เลือกดู:
    * ภาพรวมทุกเครื่อง (Multi-machine Grid / Fleet Overview)
    * สลับเจาะจงเฉพาะเครื่องที่ต้องการวิเคราะห์

---

## 6. ข้อกำหนดด้านฮาร์ดแวร์และการรองรับปริมาณงาน (Hardware Sizing)

| รูปแบบ | สเปกฮาร์ดแวร์แนะนำ | ขีดความสามารถรองรับ | ข้อควรพิจารณา |
| :--- | :--- | :--- | :--- |
| **1:1 Edge Box** *(ปัจจุบัน)* | NXP i.MX8M Plus (2.3 TOPS NPU, 4-core ARM) | 1 เครื่อง Prober | ต้นทุนประหยัด, เสียหายจำกัดเฉพาะเครื่อง |
| **1:N Small Scale** *(2 - 4 เครื่อง)* | Industrial PC + NVIDIA Jetson Orin Nano / NX | 2 - 4 เครื่อง Prober | รองรับการรัน Multi-stream Inference |
| **1:N Medium/Large** *(5 - 16 เครื่อง)* | Industrial Server + NVIDIA RTX 4060 / 4070 / A4000 | 8 - 16 เครื่อง Prober | จำเป็นต้องมีระบบ Dynamic Batching และ Redis Queue |

> [!WARNING]
> บอร์ด **i.MX8M Plus ไม่เหมาะสำหรับการรัน 1:N หลายเครื่องพร้อมกัน** เนื่องจากแบนด์วิดท์หน่วยความจำและพลังประมวลผล NPU (2.3 TOPS) ออกแบบมาสำหรับงาน Edge เดี่ยว หากนำไปรันหลายเครื่องพร้อมกันจะเกิด Latency เกิน Tact Time ทันที

---

## 7. เช็กลิสต์การเตรียมโค้ดปัจจุบันเพื่อรองรับ 1:N ในอนาคต (Actionable Checklist)

สิ่งที่เราสามารถเริ่มทำในโค้ดปัจจุบันได้ทันที โดยไม่กระทบการทำงาน 1:1 เดิม:

- [x] **พาธมีชื่อเครื่องกำกับเสมอ:** ตรวจสอบให้แน่ใจว่าพาธในคอนฟิกทุกจุดใช้โครงสร้างที่มีรหัสเครื่อง เช่น `M:\WP269\...`
- [ ] **ฟังก์ชันแกนหลักรับ `machine_id` เป็น Parameter:**
  - ปรับ `inspect_image(image_path, machine_id=...)`
  - ปรับ `write_judgment_file(result, machine_id=...)`
  - ปรับ `resolve_drive_path(path_tmpl, machine_id=...)`
  - หลีกเลี่ยงการหยิบค่าตรงจากตัวแปร Global
- [ ] **API Endpoint ดึงรูปภาพรองรับ Query `?machine=...`:**
  - ปรับ `/api/images/...` ให้รับ `machine: Optional[str] = Query(None)`
  - เพิ่ม Fallback Scan หาข้ามเครื่องจักรใน Drive M กรณีหาเครื่องปัจจุบันไม่เจอ
- [ ] **Database Indexing:**
  - เพิ่ม Index คอลัมน์ `machine_no` ในตาราง `inspections`
- [ ] **โครงสร้าง Folder Watcher เป็น Class / Worker:**
  - ออกแบบให้ตัวเฝ้ามองโฟลเดอร์เป็น Instance ที่สามารถ `spawn` เพิ่มได้ตามจำนวนเครื่องจักรที่ลงทะเบียนใน `MachineRegistry`
