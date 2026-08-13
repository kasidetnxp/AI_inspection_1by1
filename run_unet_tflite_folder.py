import os
import sys
import time
import csv
import argparse
import cv2
import numpy as np

try:
    from tflite_runtime.interpreter import Interpreter, load_delegate
except ImportError:
    from tensorflow.lite.python.interpreter import Interpreter
    try:
        from tensorflow.lite.python.interpreter import load_delegate
    except ImportError:
        load_delegate = None


DEFAULT_MODEL_PATH = "unet.tflite"
DEFAULT_LABELS_PATH = "labels.txt"
DEFAULT_INPUT_FOLDER = "input_images"
DEFAULT_OUTPUT_FOLDER = "output_images"

MASK_THRES = 0.50
MASK_ALPHA = 0.2
CONTOUR_THICKNESS = 1
MIN_PIXEL_THRES = 500


def load_labels(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            labels = [line.strip() for line in f if line.strip()]
        if labels:
            return labels
    return ["class_0"]


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def letterbox(image, new_shape=(256, 256), color=(114, 114, 114)):
    h_orig, w_orig = image.shape[:2]
    w_new, h_new = new_shape
    scale = min(w_new / w_orig, h_new / h_orig)

    w_resized = int(round(w_orig * scale))
    h_resized = int(round(h_orig * scale))
    resized = cv2.resize(image, (w_resized, h_resized), interpolation=cv2.INTER_LINEAR)

    pad_w = w_new - w_resized
    pad_h = h_new - h_resized
    pad_left, pad_top = pad_w // 2, pad_h // 2
    pad_right, pad_bottom = pad_w - pad_left, pad_h - pad_top

    padded = cv2.copyMakeBorder(
        resized, pad_top, pad_bottom, pad_left, pad_right,
        cv2.BORDER_CONSTANT, value=color
    )
    return padded, scale, pad_left, pad_top, w_resized, h_resized


MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)


def quantize_input(image_rgb, input_info):
    input_dtype = input_info["dtype"]
    # ImageNet Normalization
    image_float = (image_rgb.astype(np.float32) / 255.0 - MEAN) / STD

    if input_dtype == np.float32:
        return image_float

    scale, zero_point = input_info["quantization"]
    if scale == 0:
        return image_rgb.astype(input_dtype)

    input_data = image_float / scale + zero_point
    if input_dtype == np.uint8:
        return np.clip(input_data, 0, 255).astype(np.uint8)
    elif input_dtype == np.int8:
        return np.clip(input_data, -128, 127).astype(np.int8)
    return input_data.astype(input_dtype)


def dequantize_tensor(tensor, tensor_info):
    if tensor.dtype == np.float32:
        return tensor.astype(np.float32)
    scale, zero_point = tensor_info["quantization"]
    if scale == 0:
        return tensor.astype(np.float32)
    return (tensor.astype(np.float32) - zero_point) * scale


def preprocess_image(image, input_info):
    input_shape = input_info["shape"]
    if input_shape[3] in (1, 3):
        layout, input_h, input_w = "NHWC", int(input_shape[1]), int(input_shape[2])
    else:
        layout, input_h, input_w = "NCHW", int(input_shape[2]), int(input_shape[3])

    h_orig, w_orig = image.shape[:2]
    image_lb, scale, pad_left, pad_top, w_resized, h_resized = letterbox(image, (input_w, input_h))
    image_rgb = cv2.cvtColor(image_lb, cv2.COLOR_BGR2RGB)
    input_data = quantize_input(image_rgb, input_info)

    if layout == "NHWC":
        input_data = np.expand_dims(input_data, axis=0)
    else:
        input_data = np.transpose(input_data, (2, 0, 1))
        input_data = np.expand_dims(input_data, axis=0)

    meta = {
        "layout": layout, "input_w": input_w, "input_h": input_h,
        "original_w": w_orig, "original_h": h_orig,
        "pad_left": pad_left, "pad_top": pad_top,
        "resized_w": w_resized, "resized_h": h_resized
    }
    return input_data, meta


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -50, 50)))


def postprocess_unet(output_tensor, output_info, meta, class_names):
    output_data = dequantize_tensor(output_tensor, output_info)
    output_data = np.squeeze(output_data, axis=0)

    if meta["layout"] == "NCHW" and output_data.shape[0] in (1, len(class_names), len(class_names) + 1):
        output_data = np.transpose(output_data, (1, 2, 0))

    if len(output_data.shape) == 2:
        output_data = np.expand_dims(output_data, axis=-1)

    h_out, w_out, num_classes = output_data.shape

    # Argmax in 256x256 space matching PyTorch predict.py
    prediction_mask = np.argmax(output_data, axis=-1).astype(np.uint8)

    # Crop letterbox padding in 256x256 before scaling
    pad_left = int(meta["pad_left"] * (w_out / meta["input_w"]))
    pad_top = int(meta["pad_top"] * (h_out / meta["input_h"]))
    resized_w = int(meta["resized_w"] * (w_out / meta["input_w"]))
    resized_h = int(meta["resized_h"] * (h_out / meta["input_h"]))

    cropped_mask = prediction_mask[pad_top:pad_top + resized_h, pad_left:pad_left + resized_w]
    orig_mask = cv2.resize(cropped_mask, (meta["original_w"], meta["original_h"]), interpolation=cv2.INTER_NEAREST)

    # Extract masks per class (Class 1: pad, Class 2: probemark, Class 3: grain/contam)
    masks, class_ids = [], []
    for class_id in range(1, num_classes):
        if class_id == 1:
            # Build solid Pad mask by combining Pad (1), Probemark (2), and Grain (3)
            c_mask = ((orig_mask == 1) | (orig_mask == 2) | (orig_mask == 3)).astype(np.uint8)
        else:
            c_mask = (orig_mask == class_id).astype(np.uint8)
        if np.sum(c_mask) > 0:
            masks.append(c_mask)
            class_ids.append(class_id - 1)

    return class_ids, masks


def draw_results(image, class_ids, masks):
    result = image.copy()
    # Match PyTorch predict.py unified RGB colors in BGR format:
    # 0: Background (transparent)
    # 1: Pad: Orange (0, 128, 255)
    # 2: Probemark: Cyan (255, 255, 0)
    # 3: Grain: Hot Pink (255, 0, 255)
    unified_colors_bgr = {
        0: (0, 128, 255),   # Pad
        1: (255, 255, 0),   # Probemark
        2: (255, 0, 255)    # Grain / Contam
    }

    colored_mask = np.zeros_like(result)
    for class_id, mask in zip(class_ids, masks):
        color = unified_colors_bgr.get(class_id, (0, 255, 0))
        colored_mask[mask == 1] = color

    non_bg = np.any(colored_mask > 0, axis=-1)
    result[non_bg] = cv2.addWeighted(result[non_bg], 0.6, colored_mask[non_bg], 0.4, 0)

    return result


def load_interpreter(model_path):
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found: {model_path}")

    delegates = []
    if load_delegate:
        for path in ["libvx_delegate.so", "/usr/lib/libvx_delegate.so"]:
            try:
                delegates = [load_delegate(path)]
                print(f"Loaded NPU delegate: {path}")
                break
            except Exception:
                pass

    try:
        if delegates:
            interpreter = Interpreter(model_path=model_path, experimental_delegates=delegates)
        else:
            interpreter = Interpreter(model_path=model_path)
        interpreter.allocate_tensors()
        return interpreter
    except Exception as e:
        print(f"Warning: Default TFLite delegate failed ({e}). Falling back to standard interpreter without XNNPACK delegate...")
        try:
            # Force disabling XNNPACK delegate
            try:
                import tensorflow as tf
                interpreter = Interpreter(model_path=model_path, experimental_op_resolver_type=tf.lite.experimental.OpResolverType.BUILTIN_WITHOUT_DEFAULT_DELEGATES)
            except Exception:
                interpreter = Interpreter(model_path=model_path, experimental_delegates=[])
            interpreter.allocate_tensors()
            return interpreter
        except Exception as e2:
            print(f"Error allocating TFLite interpreter: {e2}")
            raise e2


class ModelRunner:
    def __init__(self, model_path):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
            
        self.model_path = model_path
        self.is_onnx = model_path.lower().endswith(".onnx")
        
        if self.is_onnx:
            try:
                import onnxruntime as ort
            except ImportError:
                raise ImportError(
                    "onnxruntime is required to run .onnx models. "
                    "Install with: pip install onnxruntime"
                )
            
            providers = ort.get_available_providers()
            preferred = ["VSI_NPU_ExecutionProvider", "CPUExecutionProvider"]
            active_providers = [p for p in preferred if p in providers] or providers
            
            self.session = ort.InferenceSession(model_path, providers=active_providers)
            print(f"Loaded ONNX model: {model_path}")
            print(f"Active Providers: {self.session.get_providers()}")
            
            inp = self.session.get_inputs()[0]
            out = self.session.get_outputs()[0]
            
            dtype_map = {
                "tensor(float)": np.float32,
                "tensor(float16)": np.float16,
                "tensor(uint8)": np.uint8,
                "tensor(int8)": np.int8
            }
            in_dtype = dtype_map.get(inp.type, np.float32)
            out_dtype = dtype_map.get(out.type, np.float32)
            
            self.input_details = [{"name": inp.name, "shape": inp.shape, "dtype": in_dtype, "quantization": (0.0, 0)}]
            self.output_details = [{"name": out.name, "shape": out.shape, "dtype": out_dtype, "quantization": (0.0, 0)}]
        else:
            self.interpreter = load_interpreter(model_path)
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()

    def get_input_details(self):
        return self.input_details

    def get_output_details(self):
        return self.output_details

    def infer(self, input_data):
        if self.is_onnx:
            input_name = self.input_details[0]["name"]
            outputs = self.session.run(None, {input_name: input_data})
            return outputs[0]
        else:
            self.interpreter.set_tensor(self.input_details[0]["index"], input_data)
            self.interpreter.invoke()
            return self.interpreter.get_tensor(self.output_details[0]["index"])


def print_model_info(runner):
    input_details = runner.get_input_details()
    output_details = runner.get_output_details()

    print("\n==== INPUT DETAILS ====")
    for i, item in enumerate(input_details):
        print(f"Input {i}: name={item['name']}, shape={item['shape']}, dtype={item['dtype']}, quant={item.get('quantization', (0.0, 0))}")

    print("\n==== OUTPUT DETAILS ====")
    for i, item in enumerate(output_details):
        print(f"Output {i}: name={item['name']}, shape={item['shape']}, dtype={item['dtype']}, quant={item.get('quantization', (0.0, 0))}")


def run_batch_inference(runner, input_folder, output_folder, class_names):
    os.makedirs(output_folder, exist_ok=True)
    input_details = runner.get_input_details()
    output_details = runner.get_output_details()

    image_files = [f for f in os.listdir(input_folder) if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))]
    if not image_files:
        print(f"No images found in {input_folder}")
        return {
            "num_images": 0, "total_objects": 0,
            "avg_prep_ms": 0, "avg_infer_ms": 0, "avg_post_ms": 0, "avg_frame_ms": 0
        }

    csv_path = os.path.join(output_folder, "processing_times.csv")
    csv_headers = ["Filename", "Preprocess (ms)", "Inference (ms)", "Postprocess (ms)", "Total (ms)", "Detected Objects"]

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(csv_headers)

    prep_times, infer_times, post_times, total_times = [], [], [], []
    total_objects = 0

    print(f"\nProcessing {len(image_files)} images...")
    for filename in image_files:
        img_path = os.path.join(input_folder, filename)
        image = cv2.imread(img_path)
        if image is None:
            continue

        t0 = time.time()
        input_data, meta = preprocess_image(image, input_details[0])
        t1 = time.time()

        output_tensor = runner.infer(input_data)
        t2 = time.time()

        class_ids, masks = postprocess_unet(output_tensor, output_details[0], meta, class_names)
        result = draw_results(image, class_ids, masks)
        t3 = time.time()

        out_name = f"{os.path.splitext(filename)[0]}_mask_result.jpg"
        cv2.imwrite(os.path.join(output_folder, out_name), result)

        prep_ms = (t1 - t0) * 1000
        infer_ms = (t2 - t1) * 1000
        post_ms = (t3 - t2) * 1000
        total_ms = (t3 - t0) * 1000

        prep_times.append(prep_ms)
        infer_times.append(infer_ms)
        post_times.append(post_ms)
        total_times.append(total_ms)
        total_objects += len(masks)

        with open(csv_path, "a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow([filename, f"{prep_ms:.2f}", f"{infer_ms:.2f}", f"{post_ms:.2f}", f"{total_ms:.2f}", len(masks)])

        print(f"Processed {filename} -> {len(masks)} masks ({total_ms:.2f} ms)")

    print(f"\nDone! Results saved to {output_folder}")

    return {
        "num_images": len(image_files),
        "total_objects": total_objects,
        "avg_prep_ms": float(np.mean(prep_times)) if prep_times else 0.0,
        "avg_infer_ms": float(np.mean(infer_times)) if infer_times else 0.0,
        "avg_post_ms": float(np.mean(post_times)) if post_times else 0.0,
        "avg_frame_ms": float(np.mean(total_times)) if total_times else 0.0,
    }


def run_single_benchmark(model_path, input_folder, output_folder, class_names):
    print(f"\n=======================================================")
    print(f"       STARTING BENCHMARK FOR MODEL: {model_path}")
    print(f"=======================================================")
    
    t_start_net = time.time()
    runner = ModelRunner(model_path)
    t_model_loaded = time.time()
    model_load_ms = (t_model_loaded - t_start_net) * 1000

    print_model_info(runner)
    metrics = run_batch_inference(runner, input_folder, output_folder, class_names)
    
    t_end_net = time.time()
    total_net_ms = (t_end_net - t_start_net) * 1000

    metrics["model_path"] = model_path
    metrics["model_load_ms"] = model_load_ms
    metrics["total_net_ms"] = total_net_ms
    return metrics


def print_comparison_summary(onnx_res, tflite_res):
    print("\n" + "=" * 78)
    print("                      MODEL COMPARISON BENCHMARK SUMMARY")
    print("=" * 78)
    print(f"{'Metric':<30} | {'ONNX (' + os.path.basename(onnx_res['model_path']) + ')':<20} | {'TFLite (' + os.path.basename(tflite_res['model_path']) + ')':<20}")
    print("-" * 78)
    print(f"{'Model Load Time (Net):':<30} | {onnx_res['model_load_ms']:>17.2f} ms | {tflite_res['model_load_ms']:>17.2f} ms")
    print(f"{'Avg Preprocess / Img:':<30} | {onnx_res['avg_prep_ms']:>17.2f} ms | {tflite_res['avg_prep_ms']:>17.2f} ms")
    print(f"{'Avg Inference / Img:':<30} | {onnx_res['avg_infer_ms']:>17.2f} ms | {tflite_res['avg_infer_ms']:>17.2f} ms")
    print(f"{'Avg Postprocess / Img:':<30} | {onnx_res['avg_post_ms']:>17.2f} ms | {tflite_res['avg_post_ms']:>17.2f} ms")
    print(f"{'Avg Per-Frame Total:':<30} | {onnx_res['avg_frame_ms']:>17.2f} ms | {tflite_res['avg_frame_ms']:>17.2f} ms")
    print(f"{'Net Total Execution Time:':<30} | {onnx_res['total_net_ms']:>17.2f} ms | {tflite_res['total_net_ms']:>17.2f} ms")
    print(f"{'Total Detected Objects/Masks:':<30} | {onnx_res['total_objects']:>20} | {tflite_res['total_objects']:>20}")
    print("=" * 78)


def load_config(config_path="config.yaml"):
    if not os.path.exists(config_path):
        return {}
    try:
        import yaml
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        cfg = {}
        with open(config_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.split("#")[0].strip()
                if ":" in line:
                    k, v = line.split(":", 1)
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    if v.replace(".", "", 1).isdigit():
                        v = float(v) if "." in v else int(v)
                    elif v.lower() == "true":
                        v = True
                    elif v.lower() == "false":
                        v = False
                    cfg[k] = v
        return cfg


def main():
    cfg = load_config()

    global MASK_THRES, MASK_ALPHA, CONTOUR_THICKNESS, MIN_PIXEL_THRES
    if "mask_threshold" in cfg:
        MASK_THRES = float(cfg["mask_threshold"])
    if "mask_alpha" in cfg:
        MASK_ALPHA = float(cfg["mask_alpha"])
    if "contour_thickness" in cfg:
        CONTOUR_THICKNESS = int(cfg["contour_thickness"])
    if "min_pixel_threshold" in cfg:
        MIN_PIXEL_THRES = int(cfg["min_pixel_threshold"])

    parser = argparse.ArgumentParser(description="UNet TFLite / ONNX Inference & Benchmark")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml file")
    parser.add_argument("--model", default=cfg.get("model", DEFAULT_MODEL_PATH), help="Path to TFLite or ONNX model (.tflite / .onnx)")
    parser.add_argument("--input", default=cfg.get("input_folder", DEFAULT_INPUT_FOLDER), help="Input images folder")
    parser.add_argument("--output", default=cfg.get("output_folder", DEFAULT_OUTPUT_FOLDER), help="Output images folder")
    parser.add_argument("--labels", default=cfg.get("labels_file", DEFAULT_LABELS_PATH), help="Path to labels text file")
    parser.add_argument("--info", action="store_true", help="Print model input/output details and exit")
    parser.add_argument("--compare", action="store_true", help="Run both ONNX and TFLite models and print benchmark comparison")
    parser.add_argument("--onnx-model", default=cfg.get("onnx_model", "unet.onnx"), help="ONNX model path for --compare mode")
    parser.add_argument("--tflite-model", default=cfg.get("tflite_model", "unet.tflite"), help="TFLite model path for --compare mode")
    args = parser.parse_args()

    class_names = load_labels(args.labels)

    if args.compare:
        onnx_res = run_single_benchmark(args.onnx_model, args.input, "output_onnx", class_names)
        tflite_res = run_single_benchmark(args.tflite_model, args.input, "output_tflite", class_names)
        print_comparison_summary(onnx_res, tflite_res)
    else:
        run_single_benchmark(args.model, args.input, args.output, class_names)


if __name__ == "__main__":
    main()
