
"""
Earth Echo — Grid Generation and Schema v1.1 JSON Exporter

Modules 5, 6 & 8:
- Downsample preprocessed imagery to a 64 x 32 grid.
- Apply shared linear normalization across observations.
- Preserve masked pixels as JSON null values.
- Export Schema v1.1 datasets with multiple frames.
- Register generated datasets in public/data/manifest.json.

Note:
Night Lights values are extracted from rendered NASA visualization
images. They are not calibrated satellite radiance measurements.
"""

import os
import sys
import json
import argparse

import numpy as np

from process_image import preprocess_and_extract_luminance


TARGET_WIDTH = 64
TARGET_HEIGHT = 32

SOURCE_MIN = 0.0
SOURCE_MAX = 255.0


def area_downsample_to_grid(
    luma_matrix: np.ndarray,
    target_w: int = TARGET_WIDTH,
    target_h: int = TARGET_HEIGHT
) -> list:
    """
    Downsample a 2D luminance array using block averaging.

    Valid pixels in each block are averaged.
    Fully masked blocks become None (JSON null).

    This is block averaging, not fractional-pixel area weighting.
    """

    if luma_matrix.ndim != 2:
        raise ValueError("Expected a 2D luminance matrix.")

    orig_h, orig_w = luma_matrix.shape

    if orig_h < target_h or orig_w < target_w:
        raise ValueError(
            "Input image must be at least as large as the target grid."
        )

    row_step = orig_h / target_h
    col_step = orig_w / target_w

    grid = []

    for ty in range(target_h):
        row = []

        y0 = int(ty * row_step)
        y1 = int((ty + 1) * row_step)
        y1 = max(y1, y0 + 1)

        for tx in range(target_w):
            x0 = int(tx * col_step)
            x1 = int((tx + 1) * col_step)
            x1 = max(x1, x0 + 1)

            block = luma_matrix[y0:y1, x0:x1]

            valid_pixels = block[np.isfinite(block)]

            if valid_pixels.size == 0:
                row.append(None)
            else:
                mean_luma = float(np.mean(valid_pixels))

                norm_val = (
                    (mean_luma - SOURCE_MIN)
                    / (SOURCE_MAX - SOURCE_MIN)
                )

                clamped = max(0.0, min(1.0, norm_val))

                row.append(round(clamped, 4))

        grid.append(row)

    assert len(grid) == target_h
    assert all(len(row) == target_w for row in grid)

    return grid


def update_manifest(
    dataset_id: str,
    file_path: str,
    label: str,
    group: str = "night_lights"
):
    """
    Register a generated dataset in the Schema v1.1 manifest.

    Existing entries are preserved.
    An entry with the same dataset ID is replaced.
    """

    manifest_path = os.path.join(
        "public", "data", "manifest.json"
    )

    manifest = {
        "schema_version": "1.1",
        "datasets": []
    }

    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

    if not isinstance(manifest, dict):
        raise ValueError("Manifest must be a JSON object.")

    if not isinstance(manifest.get("datasets", []), list):
        raise ValueError("Manifest datasets must be a list.")

    manifest["schema_version"] = "1.1"

    web_path = file_path.replace("\\", "/")

    if web_path.startswith("public/"):
        web_path = web_path[len("public"):]

    if not web_path.startswith("/"):
        web_path = "/" + web_path

    manifest["datasets"] = [
        entry
        for entry in manifest.get("datasets", [])
        if entry.get("id") != dataset_id
    ]

    manifest["datasets"].append({
        "id": dataset_id,
        "path": web_path,
        "label": label,
        "comparison_group": group
    })

    os.makedirs(
        os.path.dirname(manifest_path),
        exist_ok=True
    )

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(
        f"[Manifest Updated] {manifest_path} "
        f"(Total registered datasets: "
        f"{len(manifest['datasets'])})"
    )


def build_schema_v11_dataset(
    dataset_id: str,
    title: str,
    frames_data: list,
    source_url: str = "https://svs.gsfc.nasa.gov/5313/",
    attribution: str = (
        "Visualization by Kel Elkins (NASA SVS), using "
        "Suomi NPP VIIRS Black Marble data courtesy of "
        "Miguel Román and the NASA Black Marble Science Team."
    ),
    description: str = (
        "Global nighttime illumination visualization "
        "comparing 2012 and 2023 from the NASA "
        "Earth Information Center."
    )
) -> dict:
    """
    Build a Schema v1.1 dataset.

    Geographic registration has not been verified.
    The projection field is therefore a descriptive placeholder.
    """

    return {
        "schema_version": "1.1",

        "id": dataset_id,
        "title": title,

        "source": {
            "organization": (
                "NASA Goddard Space Flight Center / "
                "Scientific Visualization Studio"
            ),
            "url": source_url,
            "attribution": attribution,
            "disclaimer": (
                "Visualization-derived brightness index; "
                "not calibrated satellite radiance."
            )
        },

        "width": TARGET_WIDTH,
        "height": TARGET_HEIGHT,

        "projection": "image_grid_unverified",

        "description": description,

        "channels": [
            {
                "id": "brightness",
                "name": "Visualization Brightness Index",
                "type": "image_derived_index",
                "unit": None,
                "range": [0.0, 1.0],
                "description": (
                    "BT.709-weighted RGB display luma "
                    "extracted from NASA visualization frames. "
                    "Includes rendered geographic features; "
                    "not calibrated satellite radiance."
                )
            }
        ],

        "normalization": {
            "method": "shared_linear",
            "source_min": SOURCE_MIN,
            "source_max": SOURCE_MAX
        },

        "sonification_profile": {
            "default_channel": "brightness",
            "scale": "pentatonic_major",
            "base_frequency": 220,

            "pitch_mapping": {
                "channel": "brightness",
                "min_hz": 110,
                "max_hz": 880,
                "curve": "exponential"
            },

            "spatial_mapping": {
                "mode": "stereo_pan",
                "x_axis": "pan_left_to_right",
                "y_axis": "timbre_filter"
            },

            "legend": {
                "pitch": (
                    "Higher pitch represents a higher "
                    "visualization-derived brightness index, "
                    "not measured nighttime radiance."
                ),

                "stereo": (
                    "Left-to-right stereo panning corresponds "
                    "to horizontal position in the extracted "
                    "image grid."
                ),

                "silence": (
                    "Silent cells represent missing grid values, "
                    "currently caused by the top and bottom "
                    "image-row masks."
                )
            }
        },

        "frames": frames_data
    }


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Generate a 64x32 Schema v1.1 dataset "
            "from preprocessed imagery."
        )
    )

    parser.add_argument(
        "--id",
        type=str,
        default="night_lights_2012_2023"
    )

    parser.add_argument(
        "--title",
        type=str,
        default="NASA Night Lights 2012–2023"
    )

    parser.add_argument(
        "--inputs",
        nargs="+",
        required=True,
        help="Input image file paths"
    )

    parser.add_argument(
        "--labels",
        nargs="+",
        required=True
    )

    parser.add_argument(
        "--timestamps",
        nargs="+",
        required=True
    )

    parser.add_argument(
        "--output",
        type=str,
        default="public/data/night_lights_2012_2023.json"
    )

    parser.add_argument(
        "--group",
        type=str,
        default="night_lights"
    )

    args = parser.parse_args()

    if not (
        len(args.inputs)
        == len(args.labels)
        == len(args.timestamps)
    ):
        parser.error(
            "--inputs, --labels and --timestamps "
            "must have matching lengths."
        )

    frames = []

    for idx, (img_path, label, timestamp) in enumerate(
        zip(args.inputs, args.labels, args.timestamps)
    ):
        print(
            f"\nProcessing Frame [{idx}] "
            f"({label}, {timestamp}) from {img_path}"
        )

        luma = preprocess_and_extract_luminance(img_path)

        grid = area_downsample_to_grid(luma)

        frames.append({
            "frame_index": idx,
            "label": label,
            "timestamp": timestamp,
            "values": {
                "brightness": grid
            }
        })

    dataset = build_schema_v11_dataset(
        dataset_id=args.id,
        title=args.title,
        frames_data=frames
    )

    output_dir = os.path.dirname(args.output)

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(
            dataset,
            f,
            indent=2,
            ensure_ascii=False,
            allow_nan=False
        )

    print(
        f"\n[Export Success] "
        f"Wrote Schema v1.1 dataset to {args.output}"
    )

    update_manifest(
        args.id,
        args.output,
        args.title,
        args.group
    )


if __name__ == "__main__":
    main()
