#!/bin/bash
# Launcher: activates venv, sets up CUDA libs, runs main.py
# Usage: ./run.sh              (starts menu)
#        ./run.sh --help       (passes args to main.py)

DIR="$(cd "$(dirname "$0")" && pwd)"

# Deactivate any existing venv
deactivate 2>/dev/null

# Activate project venv
if [ -f "$DIR/.venv/bin/activate" ]; then
    source "$DIR/.venv/bin/activate"
fi

# Setup LD_LIBRARY_PATH for nvidia/CUDA libs (TensorFlow GPU support)
SITE_PKGS="$DIR/.venv/lib/python3.12/site-packages"
if [ -d "$SITE_PKGS/nvidia" ]; then
    for d in "$SITE_PKGS/nvidia"/*/lib; do
        [ -d "$d" ] && export LD_LIBRARY_PATH="$d${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    done
fi
for d in "$SITE_PKGS"/nvidia-*/lib; do
    [ -d "$d" ] && export LD_LIBRARY_PATH="$d${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
done

# Run main.py using the virtual environment's python directly
exec "$DIR/.venv/bin/python" "$DIR/main.py" "$@"

