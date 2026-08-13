"""
Central configuration loader.

Reads configs/project.yaml and exposes all project-wide constants.
Every module imports from here instead of hardcoding values.
"""
import os
import yaml

# Project root = two levels up from src/utils/
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

_CONFIG_PATH = os.path.join(PROJECT_ROOT, "configs/project.yaml")
with open(_CONFIG_PATH, "r") as f:
    _cfg = yaml.safe_load(f)

# --- Class definitions ---
# Load only active/enabled classes
_active_classes = [c for c in _cfg["classes"] if c.get("enabled", True)]
CLASSES = [c["name"] for c in _active_classes]

# Includes background (id=0)
NUM_CLASSES = len(CLASSES) + 1

# {'pad': 1, 'probemark': 2, 'grain': 3}
LABEL_TO_ID = {c["name"]: c["id"] for c in _active_classes}

# {1: 'pad', 2: 'probemark', 3: 'grain'}
ID_TO_LABEL = {v: k for k, v in LABEL_TO_ID.items()}

# {0: [0,0,0], 1: [0,120,255], 2: [0,255,0], 3: [255,0,0]}
COLOR_MAP = {0: [0, 0, 0]}
for c in _active_classes:
    COLOR_MAP[c["id"]] = c["color"]

# --- Paths (relative to PROJECT_ROOT) ---
DATA_PATHS = _cfg.get("data", {})
MODEL_PATHS = _cfg.get("models", {})
TRAINING = _cfg.get("training", {})

IMAGE_SIZE = tuple(TRAINING.get("image_size", [256, 256]))
EPOCHS = TRAINING.get("epochs", 200)
BATCH_SIZE = TRAINING.get("batch_size", 64)
LEARNING_RATE = TRAINING.get("learning_rate", 1e-4)


def get_path(key, section="data"):
    """Resolve a relative path from config to absolute."""
    paths = _cfg.get(section, {})
    rel = paths.get(key, "")
    return os.path.join(PROJECT_ROOT, rel) if rel else ""


def interactive_select_paths(model_name, default_input_root):
    """
    Interactively selects input path and customized output subfolder name.
    Lists subdirectories inside default_input_root and prompts for an option.
    """
    subdirs = []
    if os.path.exists(default_input_root):
        subdirs = sorted([d for d in os.listdir(default_input_root)
                          if os.path.isdir(os.path.join(default_input_root, d))])

    print("\nSelect Input Directory / เลือกโฟลเดอร์รูปภาพที่จะทดสอบ:")
    print("-" * 72)
    for idx, d in enumerate(subdirs):
        print(f"  [{idx + 1}] {d}")
    print(f"  [{len(subdirs) + 1}] Enter custom path... (ใส่พาธแบบกำหนดเอง)")
    print("-" * 72)

    choice = input(f"Choose option (1-{len(subdirs) + 1}) [default: 1]: ").strip()
    if not choice:
        idx = 0
    else:
        idx = int(choice) - 1 if choice.isdigit() else 0

    if 0 <= idx < len(subdirs):
        input_path = os.path.join(default_input_root, subdirs[idx])
        subfolder_name = subdirs[idx]
    else:
        try:
            import readline
            import glob
            def path_completer(text, state):
                expanded_text = os.path.expanduser(text)
                matches = glob.glob(expanded_text + '*')
                if state < len(matches):
                    match = matches[state]
                    if os.path.isdir(match) and not match.endswith('/'):
                        return match + '/'
                    return match
                return None
            readline.set_completer_delims(' \t\n;')
            readline.parse_and_bind("tab: complete")
            readline.set_completer(path_completer)
        except ImportError:
            pass

        user_path = input("Enter custom image/folder path: ").strip()
        if not user_path:
            input_path = default_input_root
            subfolder_name = "test_images"
        else:
            input_path = os.path.abspath(os.path.expanduser(user_path))
            subfolder_name = os.path.basename(input_path) or "custom_predict"

    # Ask for custom output directory name
    # ponytail: list existing subdirs in outputs/{model_name} and allow select/create
    out_root = os.path.join(PROJECT_ROOT, "outputs", model_name)
    os.makedirs(out_root, exist_ok=True)
    out_subdirs = sorted([d for d in os.listdir(out_root)
                          if os.path.isdir(os.path.join(out_root, d))])

    default_out_name = subfolder_name
    print(f"\nSelect Output Directory for {model_name} / เลือกโฟลเดอร์เก็บผลลัพธ์:")
    print("-" * 72)
    for idx, d in enumerate(out_subdirs):
        print(f"  [{idx + 1}] {d}")
    print(f"  [{len(out_subdirs) + 1}] Create new folder / ระบุชื่อโฟลเดอร์ใหม่")
    print("-" * 72)

    out_choice = input(f"Choose option (1-{len(out_subdirs) + 1}) or Enter for default [{default_out_name}]: ").strip()

    if not out_choice:
        out_subfolder = default_out_name
    elif out_choice.isdigit():
        out_idx = int(out_choice) - 1
        if 0 <= out_idx < len(out_subdirs):
            out_subfolder = out_subdirs[out_idx]
        else:
            out_name = input("Enter new output folder name: ").strip()
            out_subfolder = out_name if out_name else default_out_name
    else:
        out_subfolder = out_choice

    return input_path, out_subfolder
