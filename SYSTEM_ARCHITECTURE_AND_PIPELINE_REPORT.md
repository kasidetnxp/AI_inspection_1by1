# 🔬 รายงานทางเทคนิค: สถาปัตยกรรมระบบตรวจจับและวิเคราะห์ตำหนิบนแผ่นเวเฟอร์ด้วย Edge AI
### (AI Wafer Inspection HMI Dashboard on NXP i.MX8M Plus & Central PC)

---

## 📌 บทนำและภาพรวมของระบบ (Executive Summary)

ระบบ **AI Wafer Inspection HMI Dashboard** ถูกออกแบบและพัฒนาขึ้นสำหรับการตรวจสอบคุณภาพรอยกดเข็ม (Post-Probe Metrology Inspection: PMI) บนแผ่นสัมผัสโลหะ (Bond Pad) ของแผ่นเวเฟอร์สารกึ่งตัวนำ (Semiconductor Wafer) แบบเรียลไทม์ในสายการผลิต 

สถาปัตยกรรมของระบบใช้รูปแบบ **Decoupled 3-Tier Dual-Node Architecture** โดยแยกบทบาทการประมวลผลหน้างาน (Edge Node) ออกจากส่วนบันทึกข้อมูลส่วนกลาง (Central Server Node) และหน้าจอสั่งการ (HMI Web Dashboard) เพื่อรับประกันความเสถียรสูงสุด (Zero Downtime) แม้ระบบเครือข่ายส่วนกลางจะขัดข้อง

---

## ⚙️ ส่วนที่ 1: ขั้นตอนการประมวลผลภาพ (Pre-processing Pipeline)

กระบวนการ Pre-processing ทำหน้าที่เตรียมภาพถ่ายเวเฟอร์ที่ได้จากกล้องของเครื่อง Prober ให้อยู่ในรูปแบบ Tensor ที่เหมาะสมกับโครงข่ายประสาทเทียม **U-Net Semantic Segmentation** (และ YOLOv8-Seg) บนชิปประมวลผล **NXP i.MX8M Plus NPU**

```
[ ภาพต้นฉบับ .bmp จากเครื่อง Prober ]
               │
               ▼
┌──────────────────────────────────────────────┐
│  1. File Integrity & Retry Mechanism         │
│  - เช็คขนาดไฟล์ (> 0 bytes)                   │
│  - วนซ้ำ 5 ครั้ง (ครั้งละ 100ms) กัน Race Cond │
│  - หากอ่านไม่ได้ตัดสิน Corrupt Image (FAIL)    │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  2. Color Space Conversion                   │
│  - แปลงจาก BGR (OpenCV) สู่ RGB มาตรฐาน       │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  3. Aspect-Ratio Preserving Letterbox        │
│  - ปรับขนาดสู่ 256×256 พิกเซล                │
│  - คำนวณ Scale Factor คงอัตราส่วนเดิม        │
│  - Bilinear Interpolation (cv2.INTER_LINEAR) │
│  - เติมขอบสีเทา (114, 114, 114) ซ้าย/ขวา/บน/ล่าง│
│  - บันทึก Metadata สำหรับ Inverse Transform   │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  4. ImageNet Normalization                   │
│  - ปรับค่าพิกเซลสู่ช่วง [0.0, 1.0]           │
│  - ปรับสเกลด้วย Mean และ Std มาตรฐาน        │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  5. Hardware Quantization & Tensor Layout    │
│  - แปลง Float32 เป็น INT8/UINT8 ตาม Scale/ZP │
│  - ปรับ Tensor Layout (NHWC / NCHW)          │
│  - ขยายมิติ Batch: (1, H, W, C)              │
└──────────────────────────────────────────────┘
               │
               ▼
       [ ส่งเข้า NPU Inference ]
```

### รายละเอียดในแต่ละขั้นตอนย่อย:
1. **File Read & Race Condition Protection (การอ่านไฟล์และป้องกันข้อผิดพลาดการเขียน):**
   * ระบบทำการอ่านไฟล์ภาพผ่านฟังก์ชัน `cv2.imread(filepath)`
   * ติดตั้ง **Retry Mechanism วนซ้ำ 5 ครั้ง** โดยหน่วงเวลาครั้งละ `100 ms` เพื่อแก้ปัญหา Race Condition ที่เครื่อง Prober กำลัง Flush ข้อมูลภาพลงใน Shared Network Drive (CIFS/Samba)
   * หากไฟล์ว่างเปล่า (0 bytes) หรือไม่สามารถอ่านได้หลังจากพยายาม 5 ครั้ง ระบบจะตั้งสถานะเป็น `is_corrupt = True` และตัดสินผลเป็น `FAIL` ทันทีด้วยเหตุผล *"Corrupted or Unreadable Image"*

2. **Color Space Conversion (การแปลงปริภูมิสี):**
   * ฟังก์ชัน `cv2.imread()` ของ OpenCV จะโหลดภาพในรูปแบบสี **BGR** เป็นค่าเริ่มต้น
   * ทำการแปลงเป็น **RGB** ด้วยคำสั่ง:
     ```python
     image_rgb = cv2.cvtColor(image_lb, cv2.COLOR_BGR2RGB)
     ```
     เพื่อให้สอดคล้องกับคุณลักษณะของชุดข้อมูลที่ใช้ฝึกฝนโมเดล (Training Dataset)

3. **Aspect-Ratio Preserving Letterboxing (การย่อขยายภาพโดยรักษาอัตราส่วนเดิม):**
   * โมเดลต้องการอินพุตขนาดคงที่ $256 \times 256$ พิกเซล การย่อภาพแบบบีบอัดแกนตรงๆ (Direct resize) จะทำให้รูปทรงของ Pad และ Probemark บิดเบี้ยว เสียความถูกต้องเชิงเรขาคณิต
   * ฟังก์ชัน `letterbox(image, (input_w, input_h))` ทำการคำนวณ:
     $$\text{scale} = \min\left(\frac{W_{\text{target}}}{W_{\text{orig}}}, \frac{H_{\text{target}}}{H_{\text{orig}}}\right)$$
     $$W_{\text{resized}} = \text{round}(W_{\text{orig}} \times \text{scale}), \quad H_{\text{resized}} = \text{round}(H_{\text{orig}} \times \text{scale})$$
   * ย่อภาพด้วย **Bilinear Interpolation** (`cv2.INTER_LINEAR`)
   * คำนวณขนาด Padding:
     $$\text{pad\_left} = \frac{W_{\text{target}} - W_{\text{resized}}}{2}, \quad \text{pad\_top} = \frac{H_{\text{target}} - H_{\text{resized}}}{2}$$
   * เติมขอบด้วยสีเทามาตรฐาน `(114, 114, 114)` ผ่านคำสั่ง `cv2.copyMakeBorder`
   * **บันทึก Metadata การแปลง:** จัดเก็บค่า `scale`, `pad_left`, `pad_top`, `resized_w`, `resized_h`, `original_w`, `original_h` ลงใน Dictionary เพื่อใช้ในการแปลงพิกัดย้อนกลับในขั้นตอน Post-processing

4. **ImageNet Normalization (การปรับค่าพิกเซลให้เป็นมาตรฐาน):**
   * แปลงค่าพิกเซลจาก $[0, 255]$ ให้อยู่ในช่วง $[0.0, 1.0]$ แล้วปรับมาตรฐานตามสูตร:
     $$\text{Image}_{\text{norm}} = \frac{\frac{\text{Image}_{\text{rgb}}}{255.0} - \text{MEAN}}{\text{STD}}$$
     โดยกำหนดค่าคงที่ ImageNet:
     $$\text{MEAN} = [0.485, 0.456, 0.406], \quad \text{STD} = [0.229, 0.224, 0.225]$$

5. **Hardware Quantization & Tensor Formatting (การควอนไทซ์และการจัดรูปทรงมิติ):**
   * ตรวจสอบชนิดข้อมูลของโมเดลผ่านอินพุตดีเทล (`input_info["dtype"]`)
   * หากโมเดลเป็นประเภท **Full INT8 Quantized** (สำหรับรันบน NPU) จะทำการควอนไทซ์ด้วยสูตร:
     $$\text{Input}_{\text{quant}} = \text{clip}\left(\left\lfloor \frac{\text{Image}_{\text{norm}}}{\text{scale}} \right\rfloor + \text{zero\_point},\ -128,\ 127\right)$$
   * จัดรูปทรงมิติของ Tensor ตาม Layout ของโมเดล:
     * **NHWC Layout (TensorFlow Lite มาตรฐาน):** เพิ่มมิติ Batch ด้วย `np.expand_dims(input_data, axis=0)` ได้ Tensor ขนาด `(1, 256, 256, 3)`
     * **NCHW Layout (ONNX / TensorRT):** สลับแกนด้วย `np.transpose(input_data, (2, 0, 1))` แล้วเพิ่ม Batch ได้ Tensor ขนาด `(1, 3, 256, 256)`

---

## ⚡ ส่วนที่ 2: ขั้นตอนการประมวลผลผลลัพธ์ (Post-processing & Rule Engine)

เมื่อโมเดลทำการอนุมานผล (Inference) ผ่าน **NXP eIQ TIM-VX NPU Delegate (`libvx_delegate.so`)** ด้วยความเร็ว 15–35 ms จะได้ Output Tensor ออกมา ขั้นตอน Post-processing จะแปลงค่าความน่าจะเป็นกลับเป็นรูปทรงเรขาคณิต และส่งต่อให้ **Inspection Rule Engine** ทำการตัดสิน

```
[ Output Tensor จากโมเดล AI ]
               │
               ▼
┌──────────────────────────────────────────────┐
│  1. Dequantization & Shape Squeeze           │
│  - แปลง INT8 กลับเป็น Float32                 │
│  - Squeeze Batch Dimension ออก               │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  2. Argmax Pixel Classification              │
│  - np.argmax หา Class สูงสุดรายพิกเซล        │
│  - ได้ Prediction Mask ขนาด 256×256          │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  3. Inverse Letterbox (Un-letterbox)         │
│  - Crop ตัดขอบ Padding สีเทาออก              │
│  - cv2.resize ด้วย cv2.INTER_NEAREST         │
│  - คืนสเกลสู่ความละเอียดจริง (Original Size)   │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  4. Multi-Class Extraction & Hole-filling    │
│  - Class 1 (Pad): Fill Holes / Convex Hull   │
│  - Class 2 (Probemark): สกัดรอยเข็ม          │
│  - Class 3 (Grain): สกัดสิ่งแปลกปลอม         │
│  - กรอง Duplicate Detection (ทับซ้อน > 30%)  │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  5. Inspection Rule Engine (Decision Logic)  │
│  - ROI Boundary Filter (กรอง Pad ตกขอบภาพ)   │
│  - Auto-Calibration (คำนวณ px_per_um จาก Pad)│
│  - Pad-to-Probemark Matching (Intersection)  │
│  - cv2.distanceTransform (วัดระยะถึงขอบ Pad) │
│  - Probemark Area Ratio Check                │
│  - Missing Mark & Missing Pad Validation     │
└──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  6. Judgement & Visualization Export         │
│  - สร้างภาพ Split Comparison Canvas (Pass/Fail)│
│  - เขียนไฟล์ผลตัดสิน .txt ให้ Prober PLC     │
└──────────────────────────────────────────────┘
```

### รายละเอียดในแต่ละขั้นตอนย่อย:
1. **Dequantization & Layout Squeeze (การแปลงค่ากลับสู่ทศนิยม):**
   * หากเอาต์พุตจาก NPU เป็น Quantized Tensor (`int8` หรือ `uint8`) จะทำการ Dequantize กลับเป็น Float32:
     $$\text{Output}_{\text{float}} = (\text{Tensor}_{\text{quant}} - \text{zero\_point}) \times \text{scale}$$
   * ปลด Batch dimension ออก (`np.squeeze(output_data, axis=0)`)

2. **Pixel-wise Classification (การจำแนกคลาสรายพิกเซล):**
   * ทำการค้นหาคลาสที่มีคะแนนความน่าจะเป็นสูงสุดในแต่ละพิกเซล:
     $$\text{Prediction Mask}(x, y) = \arg\max_{c} (\text{Output}_{\text{float}}(x, y, c))$$
     ได้ผลลัพธ์เป็น 2D Array ขนาด $256 \times 256$ ที่มีค่าตั้งแต่ 0 ถึง 3:
     * `0`: Background (พื้นหลัง)
     * `1`: Pad (แผ่นสัมผัสโลหะ)
     * `2`: Probemark (รอยเข็มทดสอบ)
     * `3`: Grain / Contamination (เศษผงซิลิคอนหรือสิ่งสกปรก)

3. **Inverse Letterbox Transformation (การกู้คืนสเกลสู่ขนาดภาพจริง):**
   * ตัดส่วน Padding สีเทาที่เคยเติมไว้ออกตามพิกัดใน Metadata:
     $$\text{Cropped Mask} = \text{Prediction Mask}[\text{pad\_top} : \text{pad\_top} + \text{resized\_h},\ \text{pad\_left} : \text{pad\_left} + \text{resized\_w}]$$
   * ขยายขนาดหน้ากากกลับสู่ขนาดภาพจริง (Original Resolution) ด้วย **Nearest Neighbor Interpolation** (`cv2.INTER_NEAREST`):
     ```python
     orig_mask = cv2.resize(cropped_mask, (meta["original_w"], meta["original_h"]), interpolation=cv2.INTER_NEAREST)
     ```
     *หมายเหตุ: จำเป็นต้องใช้ `INTER_NEAREST` เท่านั้น เพื่อป้องกันไม่ให้ค่า Class ID กลายเป็นค่าทศนิยมที่ผิดเพี้ยน*

4. **Multi-class Mask Extraction & Defect Reconstruction:**
   * **Pad Reconstruction (Class 1):** เนื่องจากรอยเข็มกดอยู่บนหน้าสัมผัส Pad ทำให้โมเดลทำนายพื้นที่ตรงกลาง Pad เป็น Class 2 (Probemark) ส่งผลให้ Pad เกิดรอยโหว่ตรงกลาง ระบบจึงทำการปิดรูรั่วภายใน (Fill Interior Holes) โดยหาคอนทัวร์ภายนอก (`cv2.RETR_EXTERNAL`) แล้ววาดทึบ (`cv2.drawContours(..., thickness=-1)`) หรือใช้ `cv2.convexHull` เพื่อกู้คืนรูปทรง Pad ให้สมบูรณ์ 100%
   * **Probemark Extraction (Class 2):** สกัดหน้ากากของรอยเข็มและแปลงเป็นชุดพิกัด Polygon Contours
   * **Grain Extraction (Class 3):** สกัดหน้ากากของสิ่งแปลกปลอม พร้อมระบบ **Duplicate Filter** หากพื้นที่ของ Grain ทับซ้อนกับ Probemark เกิน 30% จะถูกตัดทิ้งเพื่อไม่ให้นับซ้ำ

5. **Inspection Rule Engine (ตรรกะการตัดสินเชิงวิศวกรรม):**
   * **ROI Boundary Filtering:** ตรวจสอบพิกัดของ Pad เทียบกับกรอบ ROI กลางภาพ ($V_{\text{ROI}} = 0.7$, $H_{\text{ROI}} = 0.7$) หาก Pad ตัวใดถูกขอบภาพตัดครึ่ง จะถูกคัดออกเพื่อป้องกันการตัดสินผิดพลาด
   * **Automatic Calibration (การเทียบสเกลพิกเซลต่อไมโครเมตร):**
     คำนวณอัตราส่วนพิกเซลต่อไมครอนจากขนาดความกว้างจริงของ Pad:
     $$\text{px\_per\_um} = \frac{\text{Pad Width (Pixels)}}{\text{pad\_width\_um}}$$
   * **Pad-to-Probemark Matching:** นำ Probemark แต่ละจุดมาหาพื้นที่ทับซ้อน (Intersection) กับ Pad เพื่อจับคู่รอยเข็มเข้ากับ Pad ที่ถูกต้อง
   * **Distance-to-Edge Calculation (การวัดระยะห่างรอยเข็มถึงขอบ Pad):**
     * สร้าง Binary Mask ของ Pad แล้วคำนวณ Euclidean Distance Map ด้วยฟังก์ชัน:
       ```python
       dist_from_edge = cv2.distanceTransform(pad_mask, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
       ```
     * ตรวจสอบทุกพิกเซลของรอยเข็ม: หากมีพิกเซลใดอยู่นอกพื้นที่ Pad จะได้ระยะทาง $= 0.0\ \mu\text{m}$ ทันที (FAIL)
     * หากอยู่ด้านในทั้งหมด จะหาระยะพิกเซลที่สั้นที่สุดแล้วแปลงเป็นไมโครเมตร:
       $$\text{Dist}_{\mu\text{m}} = \frac{\min(\text{Dist}_{\text{px}})}{\text{px\_per\_um}}$$
     * หาก $\text{Dist}_{\mu\text{m}} < \text{Fail Distance Threshold}$ (เช่น $8.0\ \mu\text{m}$) $\rightarrow$ ตัดสิน **FAIL** (สาเหตุ: *Probemark too close to edge*)
   * **Area Ratio Check (การตรวจสอบสัดส่วนพื้นที่รอยเข็ม):**
     $$\text{Area Ratio} = \frac{\sum \text{Area}(\text{Probemark Masks})}{\text{Area}(\text{Pad Mask})} \times 100\%$$
     หาก $\text{Area Ratio} > 25.0\%$ $\rightarrow$ ตัดสิน **FAIL** (สาเหตุ: *Probemark area too large* เข็มกดแรงหรือเนื้อ Pad เสียหาย)
   * **Missing Probemark Check:** หากพบคอนทัวร์ของ Pad แต่ไม่พบรอยเข็ม $\rightarrow$ ตัดสิน **FAIL** (สาเหตุ: *No probemark detected on pad* เข็มลอย ไม่สัมผัสหน้าชิป)

6. **Visualization & Machine Handshake Export:**
   * สร้างภาพเปรียบเทียบ **Split Comparison Canvas**: ด้านซ้ายเป็นภาพถ่ายดิบ ด้านขวาเป็นภาพตีกรอบ Annotation พร้อมแบนเนอร์สีเขียว (PASS) หรือสีแดง (FAIL) และข้อความระบุสาเหตุ
   * สร้างไฟล์ Text ผลการตัดสิน (Single Judgement File) เช่น `PASS_0000_WP269_20261012.txt` หรือ `FAIL_0101_WP269_20261012.txt` บันทึกลงในโฟลเดอร์ `JUDGE` ของเครื่องจักร Prober เพื่อให้คอนโทรลเลอร์ของเครื่องอ่านค่าและควบคุมระบบอัตโนมัติ

---

## 🏗️ ส่วนที่ 3: รายละเอียดสถาปัตยกรรมระบบ 3 ส่วน (3-Tier Architecture)

```mermaid
flowchart TD
    subgraph MachineLayer ["🏢 Machine Layer (Industrial Prober)"]
        Cam["📷 Wafer Camera"] -->|Save .bmp| DriveN["📁 CIFS / Samba (Drive N: & M:)"]
        DriveJudge["📁 CIFS / Samba (Drive N: JUDGE)"] -->|Read .txt| ProberPLC["📟 Prober Controller (PLC)"]
    end

    subgraph EdgeLayer ["🧠 Backend_iMX8 (Edge AI Node - Port 8001)"]
        Watcher["File Watcher Loop"] --> Ingest["Preprocess & Resize"]
        Ingest --> TFLiteNPU["⚡ TFLite TIM-VX NPU (libvx_delegate)"]
        TFLiteNPU --> PostProc["Postprocess & Contour"]
        PostProc --> RuleEng["📐 Rule Engine (distanceTransform)"]
        RuleEng --> OutGen["Draw Annotations & Judgement TXT"]
        OutGen --> LocalDB["Local In-Memory Buffer Fallback"]
    end

    subgraph CentralLayer ["🪺 Backend_PC (Central Server Node - Port 3000)"]
        NestApp["NestJS Core Service"]
        Postgres[(🐘 PostgreSQL 15 Container)]
        SocketGateway["📡 Socket.IO & WebSocket Broadcaster"]
        ConfigMaster["Master Recipes & Machine Manager"]
        NestApp --- Postgres
        NestApp --- SocketGateway
        NestApp --- ConfigMaster
    end

    subgraph ClientLayer ["💻 Frontend (Operator HMI - Port 5173)"]
        HMIView["React 19 Dashboard"]
        Beacon["🚨 Full-Screen Color Beacon"]
        Canvas["🖼️ HTML5 Canvas 1:1 Rendering"]
        ConfigEditor["⚙️ In-Browser Config Editor Modal"]
        HMIView --- Beacon
        HMIView --- Canvas
        HMIView --- ConfigEditor
    end

    DriveN -->|Read Image| Watcher
    OutGen -->|Write PASS/FAIL txt| DriveJudge
    EdgeLayer -.->|1. Async HTTP POST (Telemetry)| NestApp
    EdgeLayer -->|2. Native WebSocket (Live Stream)| HMIView
    SocketGateway -->|3. Socket.IO & WS (Hardware & Central Events)| HMIView
    HMIView -.->|4. REST API (Config Hot-Reload & Images)| EdgeLayer
    ConfigMaster -.->|5. REST API (Sync Master Configs)| EdgeLayer
```

---

### 3.1 Backend_iMX8 (Edge AI Node)
* **สภาพแวดล้อมที่รัน:** บอร์ดประมวลผลอุตสาหกรรม **NXP i.MX8M Plus** (Quad Cortex-A53 @ 1.8GHz, NPU 2.3 TOPS) หรือ PC ในโหมดจำลองสถานการณ์ (Port `8001`)
* **Tech Stack:**
  * **Framework:** Python 3.10+, FastAPI, Uvicorn (ASGI Server)
  * **AI Runtime:** TensorFlow Lite Runtime (`tflite-runtime`), NXP eIQ TIM-VX NPU Delegate (`libvx_delegate.so`), PyTorch (`torch`)
  * **Computer Vision:** OpenCV Headless (`opencv-python-headless`), NumPy, Pillow, Matplotlib
  * **System & Storage:** CIFS/Samba Client (`mount -t cifs`), WebSockets, PyYAML, psutil
* **หน้าที่และความรับผิดชอบหลัก:**
  1. **File Watcher & Batch Ingestion:** เฝ้าตรวจโฟลเดอร์ภาพที่ Prober ส่งมา (`M:\...` หรือ `N:\...`) ถอดรหัสชื่อไฟล์ตามมาตรฐานอุตสาหกรรม (Lot ID, Wafer No, Coordinate X-Y, Pad No)
  2. **NPU-Accelerated Inference:** โหลดโมเดล U-Net Quantized INT8 เข้าสู่ NPU ทำการอนุมานผลด้วยความเร็วสูง 15–35 ms ต่อภาพ พร้อมกลไก `inference_lock` ป้องกัน Race condition
  3. **Rule-Based Decision Execution:** ประมวลผลกฎการตัดสินทั้ง 7 กฎ วัดระยะห่างด้วย `distanceTransform` และคำนวณสัดส่วนพื้นที่
  4. **Prober Machine Handshake:** เขียนไฟล์ผลตัดสิน (`PASS_0000_*.txt` หรือ `FAIL_0101_*.txt`) สั่งหยุดเครื่องจักร (Stop Machine) อัตโนมัติเมื่อพบของเสีย
  5. **Direct Live Stream:** ยิงข้อมูลการตรวจสดรายชิ้นงานเข้าสู่หน้าจอ Frontend โดยตรงผ่าน Native WebSocket
  6. **Decoupled Standalone Operation:** จัดเก็บประวัติและแคชคอนฟิกไว้ใน Local In-Memory Buffer ทำให้ Edge ยังทำงานตรวจจับได้ต่อเนื่องแม้ระบบเน็ตเวิร์กส่วนกลางจะล่ม

---

### 3.2 Backend_PC (Central Server Node)
* **สภาพแวดล้อมที่รัน:** เครื่องแม่ข่ายส่วนกลาง (Industrial PC / Central Server) รันบนพอร์ต `3000`
* **Tech Stack:**
  * **Framework:** TypeScript, NestJS 10 (Enterprise Node.js Architecture), Express
  * **Database & ORM:** PostgreSQL 17 (Docker Container), In-Memory Buffer (Fallback)
  * **Real-time Engine:** Socket.IO Server (`@nestjs/platform-socket.io`), Raw WebSocket (`ws`), RxJS
  * **Utilities:** Multer (File Uploads), Child Process (สำหรับรัน Retrain Python Script)
* **หน้าที่และความรับผิดชอบหลัก:**
  1. **Central Ingestion & Enterprise Storage:** รับบันทึกผลการตรวจสอบจาก Edge Node ผ่าน REST API (`POST /api/v1/inspections`) และบันทึกลงในฐานข้อมูล PostgreSQL อย่างเป็นระบบ
  2. **Multi-Client Event Broadcasting:** กระจายอีเวนต์ผลการตรวจ (`NEW_INSPECTION`) สู่หน้าจอ HMI หลายๆ เครื่องพร้อมกันผ่าน Socket.IO ภายในเวลา < 5 ms
  3. **Hardware Telemetry Relay:** รวบรวมข้อมูลการทำงานของฮาร์ดแวร์ (CPU, RAM, Temp) และกระจายผ่าน Raw WebSocket (`/ws/hardware`)
  4. **Master Configuration & Recipe Management:** เป็น **Single Source of Truth** สำหรับไฟล์สูตรการผลิต (Product Recipes) และคอนฟิกเครื่องจักร (Machine Settings) ทั่วโรงงาน พร้อมระบบกระจาย (Push/Sync) คอนฟิกลงสู่ Edge Nodes
  5. **Model Management & Retrain Orchestrator:** คลังเก็บโมเดล AI (`.pth`, `.onnx`, `.tflite`), ควบคุมเวอร์ชัน และเป็นตัวสั่งรันสคริปต์ Retrain โมเดลแบบ Asynchronous ในแบ็กกราวด์

---

### 3.3 Frontend (Operator & Engineer HMI Web Dashboard)
* **สภาพแวดล้อมที่รัน:** จอสัมผัสอุตสาหกรรม (Industrial Touchscreen HMI) หน้าเครื่องจักร หรือเบราว์เซอร์ของวิศวกร (Port `5173`)
* **Tech Stack:**
  * **Framework:** React 19, Vite 8 (Build Tool & Dev Server)
  * **UI Styling:** Custom CSS Variables (Design System เฉพาะตัว, ไม่พึ่งพา CSS Framework ภายนอก, รองรับ Dark/Light Mode)
  * **Canvas & Data Viz:** HTML5 Canvas API (เรนเดอร์ภาพเวเฟอร์ 1:1 Frame-Perfect), Chart.js, `react-chartjs-2`
  * **Network Clients:** Native WebSocket Client, Socket.IO Client, Fetch API
* **หน้าที่และความรับผิดชอบหลัก:**
  1. **Real-time Live Inspection View:** รับข้อมูลการตรวจแบบสดและแสดงผลทันทีแบบไร้ความหน่วง
  2. **Full-Screen Visual Beacon:** หน้าจอเปลี่ยนสีสว่างวาบทั้งผืน (เขียว = PASS, แดง = FAIL) เพื่อให้ Operator ในห้อง Cleanroom มองเห็นสถานะเครื่องจักรได้ชัดเจนจากระยะไกล 5–10 เมตร
  3. **HTML5 Canvas 1:1 Rendering:** วาดภาพเวเฟอร์ความละเอียดสูงพร้อมตีกรอบพิกัด Polygon/Bounding Box ซ้อนทับอย่างแม่นยำ รองรับการ Pan & Zoom แบบสัมผัส
  4. **In-Browser Config Editor (Hot-Reload):** โปรแกรมแก้ไขไฟล์ Recipe/Machine Setting แบบมีตัวตรวจจับ JSON Syntax ในตัว สามารถแก้ไขค่า Threshold แล้วสั่งเซฟแบบ Hot-Reload เข้าสู่ตัว Edge Node ได้ทันทีโดยไม่ต้องรีสตาร์ตระบบ
  5. **Analytics & History Export:** แสดงกราฟแนวโน้ม Yield, กราฟพาเรโตข้อบกพร่อง, ตารางสืบค้นประวัติย้อนหลังแบบ Pagination และปุ่มดาวน์โหลดรายงานผลเป็นไฟล์ CSV
  6. **Benchmark & Validation Lab:** หน้าต่างประเมินความแม่นยำระหว่างผลลัพธ์ของ AI เทียบกับการตัดสินของมนุษย์ (Blind Review) คำนวณค่า Agreement Rate, Overkill (ทิ้งของดี), และ Underkill (หลุดของเสีย)

---

## 🔄 ส่วนที่ 4: รูปแบบการรับส่งข้อมูลระหว่างระบบ (Data Flow & Protocols)

| คู่การเชื่อมต่อ (Source $\rightarrow$ Destination) | โปรโตคอล (Protocol) | ช่องทาง / Endpoint | รูปแบบข้อมูล (Data Payload) | วัตถุประสงค์และการทำงาน |
|:---|:---:|:---|:---|:---|
| **Prober $\rightarrow$ Backend_iMX8** | **CIFS / Samba** | Shared Folder (`Drive N:\...`, `Drive M:\...`) | Binary File (`.bmp`, `.jpg`) | กล้อง Prober บันทึกภาพลงไดรฟ์แชร์ Edge Node ดึงภาพมาตรวจ |
| **Backend_iMX8 $\rightarrow$ Prober** | **CIFS / Samba** | Shared Folder (`Drive N:\...\JUDGE`) | Single Text File (`PASS_0000_*.txt`, `FAIL_0101_*.txt`) | Edge เขียนผลการตัดสินให้ PLC ของ Prober สั่งหยุดเครื่องหรือทำงานต่อ |
| **Backend_iMX8 $\rightarrow$ Frontend** | **Native WebSocket** | `ws://<edge_ip>:8001/ws` | JSON (`NEW_INSPECTION`, `BENCHMARK_PROGRESS`) | ส่งข้อมูลผลการตรวจสด (พิกัด, เวลา, ผล, URLs ภาพ) เข้าสู่ HMI ทันที |
| **Backend_iMX8 $\rightarrow$ Backend_PC** | **HTTP REST (POST)** | `http://<pc_ip>:3000/api/v1/inspections` | JSON Record Payload | ส่งข้อมูลประวัติผลการตรวจไปบันทึกบนฐานข้อมูลส่วนกลาง (Async Non-blocking) |
| **Backend_PC $\rightarrow$ Frontend** | **Socket.IO & Raw WS** | `ws://<pc_ip>:3000/ws/hardware` และ Socket.IO Events | JSON (`HARDWARE_METRICS`, `NEW_INSPECTION`) | ส่งค่าสถานะฮาร์ดแวร์ (CPU, RAM, Temp) และกระจายผลตรวจสู่หน้าจออื่นๆ |
| **Backend_PC $\rightarrow$ Backend_iMX8** | **HTTP REST (POST)** | `http://<edge_ip>:8001/api/config/{type}/save` | JSON (`filename`, `content`, `activate: true`) | กระจาย (Push/Sync) ไฟล์ Recipe และ Machine Setting จาก PC สู่ Edge แบบ Hot-reload |
| **Frontend $\rightarrow$ Backend_iMX8 / PC** | **HTTP REST (GET/POST)** | `/api/history`, `/api/images/*`, `/api/models/*` | JSON / Binary Image Streams | ดึงประวัติย้อนหลัง, ดึงไฟล์ภาพมาวาดบน Canvas, อัปโหลดโมเดล และแก้ไขคอนฟิก |

---

## 🏆 จุดเด่นทางวิศวกรรมสำหรับนำไปอ้างอิงในรายงาน (Engineering Highlights)

1. **Decoupled Architecture with Zero Downtime:** 
   การแยก Edge Node ออกจาก Central PC ทำให้เครื่องจักร Prober สามารถตรวจสอบชิ้นงานได้อย่างต่อเนื่อง 100% แม้ระบบเครือข่ายโรงงาน เซิร์ฟเวอร์ส่วนกลาง หรือฐานข้อมูล PostgreSQL จะปิดปรับปรุง
2. **NPU Acceleration & Full INT8 Quantization:** 
   การทำ Post-Training INT8 Quantization ร่วมกับ TIM-VX NPU Delegate ลดขนาดโมเดลลงได้กว่า 75% และเพิ่มความเร็วในการประมวลผลขึ้นกว่า 10 เท่า (จาก >300 ms บน CPU เหลือเพียง 15–35 ms บน NPU) ซึ่งเร็วกว่ารอบเวลาการถ่ายภาพของเครื่อง Prober
3. **Exact Mathematical Defect Boundary (`cv2.distanceTransform`):** 
   การใช้ Distance Transform ในการวัดระยะห่างรอยเข็มถึงขอบ Pad ให้ความแม่นยำระดับพิกเซลต่อพิกเซลที่สมบูรณ์แบบในเวลา $O(H \times W)$ ซึ่งเหนือกว่าการคำนวณแบบ Contour Loop และสามารถตรวจจับกรณีรอยเข็มหลุดขอบ Pad ได้อย่างแม่นยำ 100%
4. **Hot-Reloadable Parameter Configuration:** 
   วิศวกรสามารถปรับเปลี่ยนเกณฑ์มาตรฐาน (Thresholds) ผ่านหน้าจอ HMI ได้ทันที โดยระบบจะส่งคำสั่ง Hot-Reload เข้าสู่ Edge Node แบบเรียลไทม์ โดยไม่ต้องหยุดสายการผลิตหรือรีสตาร์ตระบบ
