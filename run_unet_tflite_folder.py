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


MODEL_PATH = "unet.tflite"
if not os.path.exists(MODEL_PATH):
    for f in os.listdir("."):
        if f.endswith(".tflite") and "unet" in f.lower():
            MODEL_PATH = f
            break

LABELS_PATH = "labels.txt"
INPUT_FOLDER = "input_images"
OUTPUT_FOLDER = "output_images"

MASK_THRES = 0.50
MASK_ALPHA = 0.2             # ความโปร่งใสของสี mask
CONTOUR_THICKNESS = 1        # ความหนาของเส้นขอบวัตถุ
MIN_PIXEL_THRES = 500        # จำนวนพิกเซลขั้นต่ำ (บน 256x256) เพื่อตัด noise ออก


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

    # TFLite format check (NHWC or NCHW)
    if input_shape[3] == 3 or input_shape[3] == 1:
        layout = "NHWC"
        input_h = int(input_shape[1])
        input_w = int(input_shape[2])
    elif input_shape[1] == 3 or input_shape[1] == 1:
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


def postprocess_unet(output_tensor, output_info, meta):
    # ponytail: decode single UNet output tensor using thresholding or argmax
    output_data = dequantize_tensor(output_tensor, output_info)
    output_data = np.squeeze(output_data, axis=0)  # shape (H, W, C) or (C, H, W)
    
    # Transpose to HWC if NCHW
    if meta["layout"] == "NCHW" and output_data.shape[0] in [1, len(CLASS_NAMES), len(CLASS_NAMES) + 1]:
        output_data = np.transpose(output_data, (1, 2, 0))

    if len(output_data.shape) == 2:
        output_data = np.expand_dims(output_data, axis=-1)

    h_out, w_out, num_classes = output_data.shape
    masks = []
    class_ids = []

    # Crop out the letterbox padding before resizing back
    pad_left = int(meta["pad_left"] * (w_out / meta["input_w"]))
    pad_top = int(meta["pad_top"] * (h_out / meta["input_h"]))
    resized_w = int(meta["resized_w"] * (w_out / meta["input_w"]))
    resized_h = int(meta["resized_h"] * (h_out / meta["input_h"]))

    def crop_and_resize(binary_mask):
        cropped = binary_mask[pad_top:pad_top + resized_h, pad_left:pad_left + resized_w]
        return cv2.resize(cropped, (meta["original_w"], meta["original_h"]), interpolation=cv2.INTER_NEAREST)

    if num_classes == len(CLASS_NAMES) + 1:
        # Multi-class with background at class 0
        class_map = np.argmax(output_data, axis=-1)
        for class_id in range(1, num_classes):
            class_mask = (class_map == class_id).astype(np.uint8)
            if np.sum(class_mask) >= MIN_PIXEL_THRES:
                masks.append(crop_and_resize(class_mask))
                class_ids.append(class_id - 1)
    else:
        # Sigmoid per channel (binary or multi-label)
        for c in range(num_classes):
            channel_data = output_data[:, :, c]
            if np.max(channel_data) > 1.0 or np.min(channel_data) < 0.0:
                channel_data = sigmoid(channel_data)
            class_mask = (channel_data >= MASK_THRES).astype(np.uint8)
            if np.sum(class_mask) >= MIN_PIXEL_THRES:
                masks.append(crop_and_resize(class_mask))
                class_ids.append(c)

    return class_ids, masks


def draw_results(image, class_ids, masks):
    result = image.copy()

    colors = [
        (0, 255, 0),
        (0, 0, 255),
        (255, 0, 0),
        (0, 255, 255),
        (255, 0, 255),
        (255, 255, 0),
    ]

    for class_id, mask in zip(class_ids, masks):
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

    output_tensor = interpreter.get_tensor(output_details[0]["index"])
    t4 = time.time()

    class_ids, masks = postprocess_unet(output_tensor, output_details[0], meta)
    t5 = time.time()

    result = draw_results(image, class_ids, masks)
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
    print(f"Detected masks  : {len(masks)}")

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
        "Detected Objects": len(masks)
    }
    return metrics


def main():
    os.makedirs(INPUT_FOLDER, exist_ok=True)
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    delegates = []
    if load_delegate is not None:
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

    print(f"Loading UNet model: {MODEL_PATH}")
    if not delegates:
        try:
            import tensorflow as tf
            op_resolver = tf.lite.experimental.OpResolverType.BUILTIN_WITHOUT_DEFAULT_DELEGATES
            interpreter = Interpreter(model_path=MODEL_PATH, experimental_op_resolver_type=op_resolver)
        except Exception:
            interpreter = Interpreter(model_path=MODEL_PATH)
    else:
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
