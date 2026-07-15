import os
import cv2
import numpy as np
import time
import csv

try:
    from tflite_runtime.interpreter import Interpreter, load_delegate
except ImportError:
    from tensorflow.lite.python.interpreter import Interpreter
    try:
        from tensorflow.lite.python.interpreter import load_delegate
    except ImportError:
        load_delegate = None


MODEL_PATH = "best.tflite"
if not os.path.exists(MODEL_PATH) and os.path.exists("best_converted.tflite"):
    MODEL_PATH = "best_converted.tflite"
LABELS_PATH = "labels.txt"

INPUT_FOLDER = "input_images"
OUTPUT_FOLDER = "output_images"

CONF_THRES = 0.25
IOU_THRES = 0.45
MASK_THRES = 0.50

MASK_COEFF_COUNT = 32

# Visualization settings
MASK_ALPHA = 0.2             # ความโปร่งใสของสี mask (0.0 - 1.0) ยิ่งน้อยยิ่งโปร่งแสง
CONTOUR_THICKNESS = 1        # ความหนาของเส้นขอบวัตถุ (1 คือบางสุด, -1 คือระบายสีเต็ม)


def load_labels(path):
    if not os.path.exists(path):
        print("labels.txt not found. Using default class names.")
        return ["class_0"]

    with open(path, "r", encoding="utf-8") as f:
        labels = [line.strip() for line in f.readlines() if line.strip()]

    if len(labels) == 0:
        return ["class_0"]

    return labels


CLASS_NAMES = load_labels(LABELS_PATH)


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def is_image_file(filename):
    return filename.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))


def letterbox(image, new_shape=(640, 640), color=(114, 114, 114)):
    original_h, original_w = image.shape[:2]
    new_w, new_h = new_shape

    scale = min(new_w / original_w, new_h / original_h)

    resized_w = int(round(original_w * scale))
    resized_h = int(round(original_h * scale))

    resized = cv2.resize(image, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR)

    pad_w = new_w - resized_w
    pad_h = new_h - resized_h

    pad_left = pad_w // 2
    pad_right = pad_w - pad_left
    pad_top = pad_h // 2
    pad_bottom = pad_h - pad_top

    padded = cv2.copyMakeBorder(
        resized,
        pad_top,
        pad_bottom,
        pad_left,
        pad_right,
        cv2.BORDER_CONSTANT,
        value=color
    )

    return padded, scale, pad_left, pad_top, resized_w, resized_h


def dequantize_tensor(tensor, tensor_info):
    if tensor.dtype == np.float32:
        return tensor.astype(np.float32)

    scale, zero_point = tensor_info["quantization"]

    if scale == 0:
        return tensor.astype(np.float32)

    return (tensor.astype(np.float32) - zero_point) * scale


def quantize_input(image_rgb, input_info):
    input_dtype = input_info["dtype"]

    image_float = image_rgb.astype(np.float32) / 255.0

    if input_dtype == np.float32:
        return image_float.astype(np.float32)

    scale, zero_point = input_info["quantization"]

    if scale == 0:
        return image_rgb.astype(input_dtype)

    input_data = image_float / scale + zero_point

    if input_dtype == np.uint8:
        input_data = np.clip(input_data, 0, 255).astype(np.uint8)
    elif input_dtype == np.int8:
        input_data = np.clip(input_data, -128, 127).astype(np.int8)
    else:
        raise TypeError(f"Unsupported input dtype: {input_dtype}")

    return input_data


def preprocess_image(image, input_details):
    input_info = input_details[0]
    input_shape = input_info["shape"]

    if len(input_shape) != 4:
        raise ValueError(f"Unsupported input shape: {input_shape}")

    # TFLite ของ YOLO ส่วนใหญ่เป็น NHWC: [1, H, W, 3]
    if input_shape[3] == 3:
        layout = "NHWC"
        input_h = int(input_shape[1])
        input_w = int(input_shape[2])
    # เผื่อบาง model เป็น NCHW: [1, 3, H, W]
    elif input_shape[1] == 3:
        layout = "NCHW"
        input_h = int(input_shape[2])
        input_w = int(input_shape[3])
    else:
        raise ValueError(f"Cannot determine input layout from shape: {input_shape}")

    original_h, original_w = image.shape[:2]

    image_lb, scale, pad_left, pad_top, resized_w, resized_h = letterbox(
        image,
        new_shape=(input_w, input_h)
    )

    image_rgb = cv2.cvtColor(image_lb, cv2.COLOR_BGR2RGB)
    input_data = quantize_input(image_rgb, input_info)

    if layout == "NHWC":
        input_data = np.expand_dims(input_data, axis=0)
    else:
        input_data = np.transpose(input_data, (2, 0, 1))
        input_data = np.expand_dims(input_data, axis=0)

    meta = {
        "layout": layout,
        "input_w": input_w,
        "input_h": input_h,
        "original_w": original_w,
        "original_h": original_h,
        "scale": scale,
        "pad_left": pad_left,
        "pad_top": pad_top,
        "resized_w": resized_w,
        "resized_h": resized_h
    }

    return input_data, meta


def xywh_to_xyxy(boxes):
    output = np.zeros_like(boxes, dtype=np.float32)

    output[:, 0] = boxes[:, 0] - boxes[:, 2] / 2.0
    output[:, 1] = boxes[:, 1] - boxes[:, 3] / 2.0
    output[:, 2] = boxes[:, 0] + boxes[:, 2] / 2.0
    output[:, 3] = boxes[:, 1] + boxes[:, 3] / 2.0

    return output


def nms(boxes, scores, iou_threshold):
    if len(boxes) == 0:
        return []

    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]

    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = scores.argsort()[::-1]

    keep = []

    while order.size > 0:
        i = order[0]
        keep.append(i)

        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])

        inter_w = np.maximum(0, xx2 - xx1)
        inter_h = np.maximum(0, yy2 - yy1)
        inter_area = inter_w * inter_h

        union = areas[i] + areas[order[1:]] - inter_area
        iou = inter_area / np.maximum(union, 1e-6)

        remain = np.where(iou <= iou_threshold)[0]
        order = order[remain + 1]

    return keep


def prepare_outputs(output_tensors, output_infos):
    """
    หา pred กับ proto อัตโนมัติ
    YOLOv8-seg ทั่วไป:
    pred  shape: [1, 37, 8400] หรือ [1, 8400, 37]
    proto shape: [1, 160, 160, 32] หรือ [1, 32, 160, 160]
    """

    processed = []

    for tensor, info in zip(output_tensors, output_infos):
        tensor = dequantize_tensor(tensor, info)
        squeezed = np.squeeze(tensor)
        processed.append(squeezed)

    pred = None
    proto = None

    for item in processed:
        shape = item.shape

        if len(shape) == 2:
            pred = item

        elif len(shape) == 3:
            if 32 in shape:
                proto = item

    if pred is None or proto is None:
        print("Cannot auto-detect pred/proto.")
        for i, item in enumerate(processed):
            print(f"Output {i} squeezed shape:", item.shape)
        raise ValueError("Unsupported YOLOv8-seg output format.")

    # pred ให้เป็น [num_predictions, features]
    # เช่น [8400, 37]
    if pred.shape[0] < pred.shape[1]: 
        pred = pred.T

    # proto ให้เป็น [mask_h, mask_w, 32]
    # เช่น [160, 160, 32]
    if proto.shape[0] == MASK_COEFF_COUNT:
        proto = np.transpose(proto, (1, 2, 0))

    if proto.shape[-1] != MASK_COEFF_COUNT:
        raise ValueError(f"Unexpected proto shape after transpose: {proto.shape}")

    print("Prediction shape:", pred.shape)
    print("Prototype mask shape:", proto.shape)

    return pred.astype(np.float32), proto.astype(np.float32)


def decode_predictions(pred, meta):
    num_classes = len(CLASS_NAMES)
    expected_features = 4 + num_classes + MASK_COEFF_COUNT

    if pred.shape[1] < expected_features:
        raise ValueError(
            f"Prediction feature size too small. "
            f"Got {pred.shape[1]}, expected at least {expected_features}. "
            f"Check labels.txt class count."
        )

    boxes_xywh = pred[:, 0:4].astype(np.float32)
    class_scores = pred[:, 4:4 + num_classes].astype(np.float32)
    mask_coeffs = pred[:, 4 + num_classes:4 + num_classes + MASK_COEFF_COUNT].astype(np.float32)

    # ถ้า scores ดูเหมือนเป็น logits ให้ sigmoid
    if np.nanmax(class_scores) > 1.0 or np.nanmin(class_scores) < 0.0:
        class_scores = sigmoid(class_scores)

    class_ids = np.argmax(class_scores, axis=1)
    scores = np.max(class_scores, axis=1)

    keep = scores >= CONF_THRES

    boxes_xywh = boxes_xywh[keep]
    scores = scores[keep]
    class_ids = class_ids[keep]
    mask_coeffs = mask_coeffs[keep]

    if len(boxes_xywh) == 0:
        return np.empty((0, 4)), np.array([]), np.array([]), np.empty((0, MASK_COEFF_COUNT))

    # ถ้า bbox เป็น normalized 0-1 ให้ scale เป็น input pixels
    if np.nanmax(boxes_xywh) <= 2.0:
        boxes_xywh[:, [0, 2]] *= meta["input_w"]
        boxes_xywh[:, [1, 3]] *= meta["input_h"]

    boxes_xyxy_input = xywh_to_xyxy(boxes_xywh)

    # NMS แยกตาม class บน coordinate ของ input letterbox
    final_indices = []

    for cls in np.unique(class_ids):
        cls_indices = np.where(class_ids == cls)[0]
        cls_boxes = boxes_xyxy_input[cls_indices]
        cls_scores = scores[cls_indices]

        keep_indices = nms(cls_boxes, cls_scores, IOU_THRES)

        for k in keep_indices:
            final_indices.append(cls_indices[k])

    if len(final_indices) == 0:
        return np.empty((0, 4)), np.array([]), np.array([]), np.empty((0, MASK_COEFF_COUNT))

    boxes_xyxy_input = boxes_xyxy_input[final_indices]
    scores = scores[final_indices]
    class_ids = class_ids[final_indices]
    mask_coeffs = mask_coeffs[final_indices]

    # scale bbox จาก input letterbox กลับไปภาพจริง
    boxes_original = boxes_xyxy_input.copy()

    boxes_original[:, [0, 2]] -= meta["pad_left"]
    boxes_original[:, [1, 3]] -= meta["pad_top"]
    boxes_original[:, :4] /= meta["scale"]

    boxes_original[:, 0] = np.clip(boxes_original[:, 0], 0, meta["original_w"] - 1)
    boxes_original[:, 1] = np.clip(boxes_original[:, 1], 0, meta["original_h"] - 1)
    boxes_original[:, 2] = np.clip(boxes_original[:, 2], 0, meta["original_w"] - 1)
    boxes_original[:, 3] = np.clip(boxes_original[:, 3], 0, meta["original_h"] - 1)

    valid = (boxes_original[:, 2] > boxes_original[:, 0]) & (boxes_original[:, 3] > boxes_original[:, 1])

    boxes_original = boxes_original[valid]
    scores = scores[valid]
    class_ids = class_ids[valid]
    mask_coeffs = mask_coeffs[valid]

    return boxes_original, scores, class_ids, mask_coeffs


def generate_masks(mask_coeffs, proto, boxes_original, meta):
    if len(mask_coeffs) == 0:
        return []

    mask_h, mask_w, mask_c = proto.shape

    proto_flat = proto.reshape(-1, mask_c)

    masks = np.matmul(mask_coeffs, proto_flat.T)
    masks = sigmoid(masks)
    masks = masks.reshape(-1, mask_h, mask_w)

    final_masks = []

    for i, mask in enumerate(masks):
        # ขยาย mask จาก proto size ไป input size
        mask_input = cv2.resize(
            mask,
            (meta["input_w"], meta["input_h"]),
            interpolation=cv2.INTER_LINEAR
        )

        # crop padding ที่เกิดจาก letterbox ออก
        pad_left = meta["pad_left"]
        pad_top = meta["pad_top"]
        resized_w = meta["resized_w"]
        resized_h = meta["resized_h"]

        mask_unpad = mask_input[
            pad_top:pad_top + resized_h,
            pad_left:pad_left + resized_w
        ]

        # resize กลับเป็นภาพจริง
        mask_original = cv2.resize(
            mask_unpad,
            (meta["original_w"], meta["original_h"]),
            interpolation=cv2.INTER_LINEAR
        )

        binary_mask = (mask_original >= MASK_THRES).astype(np.uint8)

        # จำกัด mask ให้อยู่ใน bbox
        x1, y1, x2, y2 = boxes_original[i].astype(int)

        box_mask = np.zeros_like(binary_mask, dtype=np.uint8)
        box_mask[y1:y2, x1:x2] = 1

        binary_mask = binary_mask * box_mask

        final_masks.append(binary_mask)

    return final_masks


def draw_results(image, boxes, scores, class_ids, masks):
    result = image.copy()

    colors = [
        (0, 255, 0),
        (0, 0, 255),
        (255, 0, 0),
        (0, 255, 255),
        (255, 0, 255),
        (255, 255, 0),
    ]

    for box, score, class_id, mask in zip(boxes, scores, class_ids, masks):
        class_id = int(class_id)
        color = colors[class_id % len(colors)]

        # mask overlay
        colored_mask = np.zeros_like(result)
        colored_mask[mask == 1] = color

        result = cv2.addWeighted(result, 1.0, colored_mask, MASK_ALPHA, 0)

        # contour
        contours, _ = cv2.findContours(
            mask.astype(np.uint8),
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        cv2.drawContours(result, contours, -1, color, CONTOUR_THICKNESS)

        # bbox (disabled to draw mask/segmentation only)
        # x1, y1, x2, y2 = box.astype(int)
        # cv2.rectangle(result, (x1, y1), (x2, y2), color, 2)

        # class_name = CLASS_NAMES[class_id] if class_id < len(CLASS_NAMES) else f"class_{class_id}"
        # label = f"{class_name} {score:.2f}"

        # cv2.putText(
        #     result,
        #     label,
        #     (x1, max(y1 - 6, 15)),
        #     cv2.FONT_HERSHEY_SIMPLEX,
        #     0.5,
        #     color,
        #     2
        # )

    return result


def run_one_image(interpreter, input_details, output_details, image_path, output_path):
    image = cv2.imread(image_path)

    if image is None:
        print("Cannot read image:", image_path)
        return None
    
    t0 = time.time()
    input_data, meta = preprocess_image(image, input_details)
    t1 = time.time()

    interpreter.set_tensor(input_details[0]["index"], input_data)

    t2 = time.time()
    interpreter.invoke()
    t3 = time.time()

    output_tensors = []
    for output_info in output_details:
        output_tensors.append(interpreter.get_tensor(output_info["index"]))
    t4 = time.time()

    pred, proto = prepare_outputs(output_tensors, output_details)

    boxes, scores, class_ids, mask_coeffs = decode_predictions(pred, meta)
    masks = generate_masks(mask_coeffs, proto, boxes, meta)
    t5 = time.time()

    result = draw_results(image, boxes, scores, class_ids, masks)
    t6 = time.time()

    cv2.imwrite(output_path, result)
    t7 = time.time()


    print(f"Preprocess      : {(t1 - t0) * 1000:.2f} ms")
    print(f"Set tensor      : {(t2 - t1) * 1000:.2f} ms")
    print(f"Invoke          : {(t3 - t2) * 1000:.2f} ms")
    print(f"Get outputs     : {(t4 - t3) * 1000:.2f} ms")
    print(f"Postprocess     : {(t5 - t4) * 1000:.2f} ms")
    print(f"Draw            : {(t6 - t5) * 1000:.2f} ms")
    print(f"Save image      : {(t7 - t6) * 1000:.2f} ms")
    print(f"Total per image : {(t7 - t0) * 1000:.2f} ms")
    print(f"Saved: {output_path}")
    print(f"Detected objects: {len(boxes)}")

    metrics = {
        "Filename": os.path.basename(image_path),
        "Preprocess (ms)": f"{(t1 - t0) * 1000:.2f}",
        "Set Tensor (ms)": f"{(t2 - t1) * 1000:.2f}",
        "Invoke (ms)": f"{(t3 - t2) * 1000:.2f}",
        "Get Outputs (ms)": f"{(t4 - t3) * 1000:.2f}",
        "Postprocess (ms)": f"{(t5 - t4) * 1000:.2f}",
        "Draw (ms)": f"{(t6 - t5) * 1000:.2f}",
        "Save Image (ms)": f"{(t7 - t6) * 1000:.2f}",
        "Total (ms)": f"{(t7 - t0) * 1000:.2f}",
        "Detected Objects": len(boxes)
    }
    return metrics


def main():
    # print("Labels:", CLASS_NAMES)

    os.makedirs(INPUT_FOLDER, exist_ok=True)
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    delegates = []
    if load_delegate is not None:
        # Force using NPU instead of GPU
        os.environ["USE_GPU_INFERENCE"] = "0"
        
        possible_delegate_paths = [
            "libvx_delegate.so",
            "liblitert_vx_delegate.so",
            "/usr/lib/libvx_delegate.so",
            "/usr/lib/liblitert_vx_delegate.so",
            "/usr/lib64/libvx_delegate.so",
            "/usr/lib64/liblitert_vx_delegate.so"
        ]
        for path in possible_delegate_paths:
            try:
                print(f"Trying to load NPU delegate: {path}...")
                try:
                    npu_delegate = load_delegate(path, {})
                except TypeError:
                    npu_delegate = load_delegate(path)
                delegates = [npu_delegate]
                print(f"Successfully loaded NPU delegate from: {path}")
                break
            except Exception as e:
                print(f"Failed to load {path}: {e}")
                
        if not delegates:
            print("NPU delegate not found or failed to load. Running on CPU.")

    interpreter = Interpreter(model_path=MODEL_PATH, experimental_delegates=delegates)
    interpreter.allocate_tensors()

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    print("\n==== INPUT DETAILS ====")
    for item in input_details:
        print(item["shape"], item["dtype"], item["quantization"])

    print("\n==== OUTPUT DETAILS ====")
    for item in output_details:
        print(item["shape"], item["dtype"], item["quantization"])

    image_files = [
        f for f in os.listdir(INPUT_FOLDER)
        if is_image_file(f)
    ]

    print(f"\nFound {len(image_files)} images in {INPUT_FOLDER}")

    if len(image_files) == 0:
        print("No images found. Please put test images into input_images/")
        return

    csv_path = os.path.join(OUTPUT_FOLDER, "processing_times.csv")
    csv_headers = [
        "Filename",
        "Preprocess (ms)",
        "Set Tensor (ms)",
        "Invoke (ms)",
        "Get Outputs (ms)",
        "Postprocess (ms)",
        "Draw (ms)",
        "Save Image (ms)",
        "Total (ms)",
        "Detected Objects"
    ]

    try:
        with open(csv_path, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(csv_headers)
        print(f"Initialized CSV file at: {csv_path}")
    except Exception as e:
        print(f"Warning: Could not initialize CSV file: {e}")

    for filename in image_files:
        image_path = os.path.join(INPUT_FOLDER, filename)

        name, _ = os.path.splitext(filename)
        output_path = os.path.join(OUTPUT_FOLDER, f"{name}_mask_result.jpg")

        print("\nProcessing:", filename)

        try:
            metrics = run_one_image(
                interpreter,
                input_details,
                output_details,
                image_path,
                output_path
            )
            if metrics:
                try:
                    with open(csv_path, mode='a', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        writer.writerow([metrics[h] for h in csv_headers])
                except Exception as e:
                    print(f"Warning: Could not write metrics to CSV for {filename}: {e}")
        except Exception as e:
            print("Error while processing:", filename)
            print("Error:", e)

    print(f"\nDone. Processing times saved to: {csv_path}")


if __name__ == "__main__":
    main()