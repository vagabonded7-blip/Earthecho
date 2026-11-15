"""
Earth Echo — NASA SVS #3912 Sea Surface Currents & Temperature Processor

MODULE 2, 3, 5 & 8: Ocean Dataset Ingestion & Schema v1.1 Generator
Purpose:
  1. Ingests NASA ECCO2 global ocean visualization TIFFs (2048x1024) from raw_data/ocean/.
  2. Masks continental landmasses (black pixels R=G=B=0) as null/silent cells.
  3. Computes ITU-R BT.709 flow luminance on valid ocean pixels.
  4. Area-downsamples to exactly 64 columns x 32 rows.
  5. Assembles multi-frame Schema v1.1 dataset (Timestep 23000 and 31000).
  6. Exports public/data/sea_surface_temp.json and updates public/data/manifest.json.
"""

import os
import sys
import json
from PIL import Image
import numpy as np

TARGET_WIDTH = 64
TARGET_HEIGHT = 32
LUMA_R = 0.2126
LUMA_G = 0.7152
LUMA_B = 0.0722

def process_ocean_frame(tif_path: str) -> list:
    """Downsamples a 2048x1024 ocean TIFF to a 64x32 grid with land masked as null."""
    if not os.path.exists(tif_path):
        raise FileNotFoundError(f"TIFF not found: {tif_path}")

    print(f"\n[Processing Ocean Frame] {os.path.basename(tif_path)} ...")
    with Image.open(tif_path) as img:
        arr = np.array(img, dtype=np.float32)

    height, width, _ = arr.shape
    # Land mask: pure black pixels
    land_mask = (arr[:, :, 0] < 2.0) & (arr[:, :, 1] < 2.0) & (arr[:, :, 2] < 2.0)

    # Compute luminance on RGB channels
    luma = LUMA_R * arr[:, :, 0] + LUMA_G * arr[:, :, 1] + LUMA_B * arr[:, :, 2]
    # Set land pixels to NaN so they become null
    luma[land_mask] = np.nan

    row_step = height / TARGET_HEIGHT
    col_step = width / TARGET_WIDTH

    grid = []
    land_cells = 0
    ocean_cells = 0

    for ty in range(TARGET_HEIGHT):
        row = []
        y0 = int(ty * row_step)
        y1 = int((ty + 1) * row_step)
        for tx in range(TARGET_WIDTH):
            x0 = int(tx * col_step)
            x1 = int((tx + 1) * col_step)

            block = luma[y0:y1, x0:x1]
            valid_pixels = block[~np.isnan(block)]

            # If more than 75% of the 32x32 cell is continental land, treat cell as land (null)
            if valid_pixels.size < (block.size * 0.25):
                row.append(None)
                land_cells += 1
            else:
                mean_luma = float(np.mean(valid_pixels))
                norm_val = round(max(0.0, min(1.0, mean_luma / 255.0)), 4)
                row.append(norm_val)
                ocean_cells += 1
        grid.append(row)

    print(f" -> Result: {ocean_cells} ocean cells, {land_cells} masked land cells ({TARGET_WIDTH}x{TARGET_HEIGHT})")
    return grid

def generate_ocean_dataset():
    ocean_dir = os.path.join("raw_data", "ocean")
    frame1_path = os.path.join(ocean_dir, "flat_global_ecco2_2028x1024.23000.tif")
    frame2_path = os.path.join(ocean_dir, "flat_global_ecco2_2028x1024.31000.tif")

    grid1 = process_ocean_frame(frame1_path)
    grid2 = process_ocean_frame(frame2_path)

    dataset = {
        "schema_version": "1.1",
        "id": "sea_surface_temp",
        "title": "NASA Sea Surface Currents and Temperature (ECCO2)",
        "source": {
            "organization": "NASA Jet Propulsion Laboratory / Goddard Space Flight Center",
            "url": "https://svs.gsfc.nasa.gov/3912/",
            "attribution": "Visualization by Horace Mitchell (NASA SVS), using Estimating the Circulation and Climate of the Ocean, Phase II (ECCO2) model data.",
            "disclaimer": "Visualization-derived flow and temperature index; not direct in-situ thermometer measurements."
        },
        "width": TARGET_WIDTH,
        "height": TARGET_HEIGHT,
        "projection": "equirectangular_plate_carree",
        "description": "Global ocean surface velocity currents and sea surface temperature gradients from NASA's high-resolution ECCO2 model.",
        "channels": [
            {
                "id": "current_intensity",
                "name": "Ocean Current & Thermal Gradient Index",
                "type": "image_derived_index",
                "unit": None,
                "range": [0.0, 1.0],
                "description": "Relative surface kinetic current speed and temperature contrast extracted from ECCO2 visualization."
            }
        ],
        "normalization": {
            "method": "shared_linear",
            "source_min": 0.0,
            "source_max": 255.0
        },
        "sonification_profile": {
            "default_channel": "current_intensity",
            "scale": "pentatonic_major",
            "base_frequency": 174,
            "pitch_mapping": {
                "channel": "current_intensity",
                "min_hz": 87,
                "max_hz": 523,
                "curve": "exponential"
            },
            "spatial_mapping": {
                "mode": "stereo_pan",
                "x_axis": "pan_left_to_right",
                "y_axis": "timbre_filter"
            },
            "legend": {
                "pitch": "Higher pitch indicates stronger ocean surface current flow and thermal gradients.",
                "stereo": "Left-to-right stereo panning corresponds to global longitude across the oceans.",
                "silence": "Silent cells represent continental landmasses and permanent polar ice sheets."
            }
        },
        "frames": [
            {
                "frame_index": 0,
                "label": "Timestep 23000 (September 2005)",
                "timestamp": "2005-09-01T00:00:00Z",
                "values": {
                    "current_intensity": grid1
                }
            },
            {
                "frame_index": 1,
                "label": "Timestep 31000 (March 2006)",
                "timestamp": "2006-03-01T00:00:00Z",
                "values": {
                    "current_intensity": grid2
                }
            }
        ]
    }

    out_file = os.path.join("public", "data", "sea_surface_temp.json")
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2)
    print(f"\n[Export Complete] Saved ocean dataset to {out_file}")

    # Register in manifest
    manifest_path = os.path.join("public", "data", "manifest.json")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    # Check if entry exists
    manifest["datasets"] = [d for d in manifest.get("datasets", []) if d.get("id") != "sea_surface_temp"]
    manifest["datasets"].append({
        "id": "sea_surface_temp",
        "path": "/data/sea_surface_temp.json",
        "label": "NASA Sea Surface Currents & Temperature (ECCO2)",
        "comparison_group": "ocean"
    })

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"[Manifest Updated] Registered sea_surface_temp in {manifest_path}")

if __name__ == "__main__":
    generate_ocean_dataset()
