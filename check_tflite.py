import numpy as np

try:
    from tflite_runtime.interpreter import Interpreter
except ImportError:
    from tensorflow.lite.python.interpreter import Interpreter


MODEL_PATH = "best.tflite"


def main():
    interpreter = Interpreter(model_path=MODEL_PATH)
    interpreter.allocate_tensors()

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    print("==== INPUT DETAILS ====")
    for i, item in enumerate(input_details):
        print(f"\nInput {i}")
        print("name:", item["name"])
        print("shape:", item["shape"])
        print("dtype:", item["dtype"])
        print("quantization:", item["quantization"])

    print("\n==== OUTPUT DETAILS ====")
    for i, item in enumerate(output_details):
        print(f"\nOutput {i}")
        print("name:", item["name"])
        print("shape:", item["shape"])
        print("dtype:", item["dtype"])
        print("quantization:", item["quantization"])

    print("\nCheck done.")


if __name__ == "__main__":
    main()