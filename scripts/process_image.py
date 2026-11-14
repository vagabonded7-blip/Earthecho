"""
Earth Echo — Image Preprocessing and Luminance Extraction Tool

MODULE 3 & 4: Image Preprocessing & Brightness Extraction
Purpose:
  1. Loads raw NASA visualization image/frame.
  2. Strips graphical letterboxes, annotations, and titles while preserving spatial alignment.
  3. Computes ITU-R BT.709 perceived luminance from sRGB:
       Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  4. Flattens alpha transparency and identifies invalid/masked pixels (polar ice, transparent borders).
  5. Preserves spatial correspondence between multi-temporal observations.

Usage:
  python scripts/process_image.py --input raw_data/svs_5313_frame.png --output-preview processed_preview.png
"""

import os
import sys
import argparse
import numpy as np
from PIL import Image

# ITU-R BT.709 relative luminance coefficients (HDTV standard for sRGB color space)
LUMA_R = 0.2126
LUMA_G = 0.7152
LUMA_B = 0.0722

def preprocess_and_extract_luminance(
    image_path: str,
    crop_top: int = 0,
    crop_bottom: int = 0,
    crop_left: int = 0,
    crop_right: int = 0,
    mask_polar_rows_percent: float = 0.0 # Top & bottom ~6% masked for extreme polar latitudes
) -> np.ndarray:
    """
    Loads an image, applies boundary cropping to remove letterboxing/annotations,
    handles alpha channels, and computes an unnormalized float luminance matrix.
    Invalid or masked pixels are returned as np.nan.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Source image not found: {image_path}")

    with Image.open(image_path) as img:
        width, height = img.size
        mode = img.mode
                # Validate cropping parameters
        crop_values = (crop_top, crop_bottom, crop_left, crop_right)

        if any(value < 0 for value in crop_values):
            raise ValueError("Crop values cannot be negative.")

        if crop_left + crop_right >= width:
            raise ValueError("Cropping removes the entire image width.")

        if crop_top + crop_bottom >= height:
            raise ValueError("Cropping removes the entire image height.")
        print(f"\n[Preprocessing] Ingesting: {os.path.basename(image_path)} ({width}x{height}, {mode})")

        # 1. Coordinate Bounding Box / Cropping Audit
        if crop_top > 0 or crop_bottom > 0 or crop_left > 0 or crop_right > 0:
            box = (crop_left, crop_top, width - crop_right, height - crop_bottom)
            print(f" [Cropping] Bounding box: Left={crop_left}, Top={crop_top}, Right={width - crop_right}, Bottom={height - crop_bottom}")
            img = img.crop(box)
            width, height = img.size
            print(f" [Cropped Resolution] {width}x{height} px")

        # 2. Alpha Transparency Handling
        img_rgb = img.convert("RGBA")
        raw_rgba = np.array(img_rgb, dtype=np.float32)

        r = raw_rgba[:, :, 0]
        g = raw_rgba[:, :, 1]
        b = raw_rgba[:, :, 2]
        a = raw_rgba[:, :, 3] / 255.0  # Normalize alpha to [0, 1]

        # 3. ITU-R BT.709 Perceived Luminance Calculation
        # Y is in range [0.0, 255.0]
        luminance = LUMA_R * r + LUMA_G * g + LUMA_B * b
        # Mask cells where alpha is 0
        luminance[a < 0.05] = np.nan

        # 4. Polar Mask Application
        # Extreme latitudes (High Arctic and Antarctica) where VIIRS nighttime composites
        # have persistent solar glare or winter cloud limits
        if mask_polar_rows_percent > 0:
            polar_rows = int(height * (mask_polar_rows_percent / 100.0))
            if polar_rows > 0:
                luminance[:polar_rows, :] = np.nan
                luminance[-polar_rows:, :] = np.nan
                print(f" [Polar Mask] Masked top {polar_rows} rows and bottom {polar_rows} rows as NaN.")

        valid_mask = ~np.isnan(luminance)
        valid_count = np.count_nonzero(valid_mask)
        total_count = luminance.size
        if valid_count == 0:
            raise ValueError(
                "No valid pixels remain after preprocessing. "
                "Check cropping, alpha transparency, and masking settings."
            )
        print(f" [Luminance Extracted] Valid pixels: {valid_count} / {total_count} ({valid_count/total_count*100:.1f}%)")
        print(f"                      Min valid luma: {np.nanmin(luminance):.2f}, Max: {np.nanmax(luminance):.2f}")

        return luminance

def save_preview(luminance: np.ndarray, output_path: str):
    """Saves a normalized grayscale PNG preview of the preprocessed luminance."""
    preview_arr = np.nan_to_num(luminance, nan=0.0)
    max_val = np.nanmax(luminance)
    if max_val > 0:
        preview_arr = (preview_arr / max_val * 255.0).astype(np.uint8)
    else:
        preview_arr = preview_arr.astype(np.uint8)

    preview_img = Image.fromarray(preview_arr, mode="L")
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    preview_img.save(output_path)
    print(f" [Saved Preview] {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Image Preprocessing and Luminance Extraction")
    parser.add_argument("--input", type=str, required=True, help="Input image file path")
    parser.add_argument("--crop-top", type=int, default=0, help="Pixels to crop from top")
    parser.add_argument("--crop-bottom", type=int, default=0, help="Pixels to crop from bottom")
    parser.add_argument("--crop-left", type=int, default=0, help="Pixels to crop from left")
    parser.add_argument("--crop-right", type=int, default=0, help="Pixels to crop from right")
    parser.add_argument("--output-preview", type=str, default="raw_data/preprocessed_preview.png", help="Preview output PNG")
    args = parser.parse_args()

    luma = preprocess_and_extract_luminance(
        args.input,
        crop_top=args.crop_top,
        crop_bottom=args.crop_bottom,
        crop_left=args.crop_left,
        crop_right=args.crop_right
    )
    save_preview(luma, args.output_preview)

