"""
Earth Echo — NASA Night Lights Source Inspection Script

MODULE 1 & 2: Pre-Extraction Source Verification Tool
Purpose:
  Inspects raw visual assets (images or video stills) from NASA SVS #5276 / #5313
  before downsampling or grid extraction. Verifies:
    1. File existence and integrity.
    2. Exact image dimensions (width x height) and aspect ratio.
    3. Color mode (RGB, RGBA, Grayscale, Indexed).
    4. Channel bit-depth and dynamic range (min, max, mean intensity).
    5. Detection of letterbox/pillarbox black borders.
    6. Alignment verification between 2012 and 2023 observation candidates.

Usage:
  python scripts/inspect_source.py --path raw_data/your_image.png
  python scripts/inspect_source.py --compare raw_data/2012.png raw_data/2023.png
"""

import os
import sys
import argparse
from PIL import Image
import numpy as np

def inspect_single_image(image_path: str) -> dict:
    """Inspects a single image file and returns scientific and structural metadata."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Source file not found: {image_path}")

    print(f"\n=======================================================")
    print(f" NASA SOURCE AUDIT: {os.path.basename(image_path)}")
    print(f" Path: {os.path.abspath(image_path)}")
    print(f"=======================================================")

    try:
        with Image.open(image_path) as img:
            format_name = img.format
            mode = img.mode
            width, height = img.size
            aspect_ratio = width / height

            print(f" [Format]       : {format_name}")
            print(f" [Dimensions]   : {width} x {height} px")
            print(f" [Aspect Ratio] : {aspect_ratio:.4f} (Standard Equirectangular Plate Carree is 2.0000; 16:9 HD is 1.7778)")
            print(f" [Color Mode]   : {mode}")

            # Convert to numpy array for numerical inspection
            data = np.array(img)
            dtype = data.dtype
            shape = data.shape
            print(f" [Data Type]    : {dtype}")
            print(f" [Matrix Shape] : {shape}")

            # Check alpha transparency
            has_alpha = False
            if mode in ('RGBA', 'LA') or (mode == 'P' and 'transparency' in img.info):
                has_alpha = True
                print(f" [Transparency] : Alpha channel PRESENT (Must be flattened or masked during luminance extraction)")
            else:
                print(f" [Transparency] : No alpha channel detected")

            # Check border padding / letterboxing
            # Convert to grayscale for quick luminance boundary check
            gray = np.array(img.convert('L'))
            top_row_mean = np.mean(gray[0, :])
            bottom_row_mean = np.mean(gray[-1, :])
            left_col_mean = np.mean(gray[:, 0])
            right_col_mean = np.mean(gray[:, -1])

            print(f"\n --- Perimeter Luminance (Border Check) ---")
            print(f" Top row mean:    {top_row_mean:.2f} / 255")
            print(f" Bottom row mean: {bottom_row_mean:.2f} / 255")
            print(f" Left col mean:   {left_col_mean:.2f} / 255")
            print(f" Right col mean:  {right_col_mean:.2f} / 255")

            if top_row_mean < 1.0 and bottom_row_mean < 1.0:
                print(" -> Notice: Top and bottom rows are near zero. Verify if this is black letterboxing or polar ice mask.")

            # Dynamic range
            min_val = np.min(gray)
            max_val = np.max(gray)
            mean_val = np.mean(gray)
            std_val = np.std(gray)
            print(f"\n --- Dynamic Range & Distribution ---")
            print(f" Minimum Value: {min_val}")
            print(f" Maximum Value: {max_val}")
            print(f" Mean Value:    {mean_val:.2f}")
            print(f" Std Dev:       {std_val:.2f}")

            return {
                "path": image_path,
                "format": format_name,
                "width": width,
                "height": height,
                "aspect_ratio": aspect_ratio,
                "mode": mode,
                "has_alpha": has_alpha,
                "min_val": int(min_val),
                "max_val": int(max_val),
                "mean_val": float(mean_val)
            }
    except Exception as e:
        print(f"Error opening image: {e}")
        raise

def compare_observations(path_a: str, path_b: str):
    """Compares two observation candidates for dimensional and spatial compatibility."""
    print("\n=======================================================")
    print(" OBSERVATION PAIR COMPATIBILITY AUDIT")
    print("=======================================================")
    info_a = inspect_single_image(path_a)
    info_b = inspect_single_image(path_b)

    print("\n--- Compatibility Verdict ---")
    dim_match = (info_a['width'] == info_b['width']) and (info_a['height'] == info_b['height'])
    mode_match = info_a['mode'] == info_b['mode']

    if dim_match:
        print(f" [PASS] Dimensions match identically: {info_a['width']} x {info_a['height']}")
    else:
        print(f" [FAIL] Dimension MISMATCH: A=({info_a['width']}x{info_a['height']}), B=({info_b['width']}x{info_b['height']})")
        print("        Observation pair cannot be differenced cell-by-cell without alignment/resampling.")

    if mode_match:
        print(f" [PASS] Color modes match: {info_a['mode']}")
    else:
        print(f" [WARN] Color mode difference: A={info_a['mode']}, B={info_b['mode']}. Requires uniform luminance mapping.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Audit NASA visualization files before extraction.")
    parser.add_argument("--path", type=str, help="Path to single image/frame to inspect")
    parser.add_argument("--compare", nargs=2, metavar=('A', 'B'), help="Compare two observation images for compatibility")
    args = parser.parse_args()

    if args.compare:
        compare_observations(args.compare[0], args.compare[1])
    elif args.path:
        inspect_single_image(args.path)
    else:
        print("Please provide --path <file> or --compare <fileA> <fileB>")
        print("Example: python scripts/inspect_source.py --path raw_data/sample.png")

