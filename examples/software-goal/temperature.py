"""Small runnable acceptance example: Celsius to Fahrenheit."""

import argparse
import math


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("celsius", type=float)
    args = parser.parse_args()
    if not math.isfinite(args.celsius):
        parser.error("temperature must be finite")
    fahrenheit = args.celsius * 1.8 + 32
    if not math.isfinite(fahrenheit):
        parser.error("temperature is out of range")
    print(f"{fahrenheit:.1f} F")


if __name__ == "__main__":
    main()
