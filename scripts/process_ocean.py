
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw_data" / "ocean"
OUTPUT = ROOT / "public" / "data" / "ocean_ecco2_2007_2008.json"

FRAMES = [
    ("23000", "2007-03-25T12:00:00Z"),
    ("31000", "2008-03-03T12:00:00Z"),
]

SOURCE_BASE = (
    "https://svs.gsfc.nasa.gov/vis/a000000/"
    "a003900/a003912/frames/2048x1024_1x1_30p/orig/"
)

WIDTH, HEIGHT = 64, 32


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def process_frame(frame_id):
    filename = f"flat_global_ecco2_2028x1024.{frame_id}.tif"
    path = RAW / filename

    if not path.is_file():
        raise FileNotFoundError(f"Missing NASA source: {path}")

    with Image.open(path) as img:
        if img.size != (2048, 1024):
            raise ValueError(f"Unexpected dimensions: {img.size}")
        rgb = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0

    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    chroma = maximum - minimum

    # Mask predominantly gray/dark background pixels.
    # This is a visual heuristic, not a verified land/ocean mask.
    valid = (chroma > 25 / 255.0) & (maximum > 45 / 255.0)

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    safe_chroma = np.where(chroma > 0, chroma, 1.0)

    hue = np.zeros_like(maximum)
    red_max = (maximum == r)
    green_max = (~red_max) & (maximum == g)
    blue_max = ~(red_max | green_max)

    hue[red_max] = ((g - b) / safe_chroma)[red_max] % 6
    hue[green_max] = ((b - r) / safe_chroma + 2)[green_max]
    hue[blue_max] = ((r - g) / safe_chroma + 4)[blue_max]
    hue = hue / 6.0

    grid = []
    coverage = []
    for y in range(HEIGHT):
        row, coverage_row = [], []
        for x in range(WIDTH):
            ys = slice(y * 32, (y + 1) * 32)
            xs = slice(x * 32, (x + 1) * 32)
            block_valid = valid[ys, xs]
            fraction = float(block_valid.mean())

            # Reject cells with fewer than 5% colored pixels.
            if fraction < 0.05:
                row.append(None)
            else:
                # Exploratory hue index; not a physical temperature scale.
                row.append(round(float(hue[ys, xs][block_valid].mean()), 4))

            coverage_row.append(round(fraction, 4))
        grid.append(row)
        coverage.append(coverage_row)

    return grid, coverage, filename, sha256(path)


def main():
    frames = []
    provenance = []

    for index, (frame_id, timestamp) in enumerate(FRAMES):
        grid, coverage, filename, digest = process_frame(frame_id)
        frames.append({
            "frame_index": index,
            "label": timestamp[:10],
            "timestamp": timestamp,
            "values": {
                "ocean_color_index": grid
            }
        })
        provenance.append({
            "frame_id": frame_id,
            "filename": filename,
            "url": SOURCE_BASE + filename,
            "timestamp": timestamp,
            "sha256": digest
        })
        valid_cells = sum(v is not None for row in grid for v in row)
        print(f"{frame_id}: {valid_cells}/{WIDTH * HEIGHT} valid grid cells")

    dataset = {
        "schema_version": "1.1",
        "id": "ocean_ecco2_2007_2008",
        "title": "ECCO2 Ocean Visualization Color Index",
        "description": (
            "Exploratory color index extracted from NASA ECCO2 "
            "rendered ocean-current and temperature visualization. "
            "Not calibrated sea-surface temperature or current velocity."
        ),
        "source": {
            "organization": "NASA Goddard Space Flight Center / Scientific Visualization Studio",
            "url": "https://svs.gsfc.nasa.gov/3912/",
            "attribution": "NASA/GSFC Scientific Visualization Studio; ECCO2 MIT/JPL model.",
            "disclaimer": (
                "Visualization-derived ocean color index from rendered ECCO2 model imagery. "
                "Not calibrated sea-surface temperature, ocean-current speed, or a direct satellite measurement."
            )
        },
        "width": WIDTH,
        "height": HEIGHT,
        "projection": "image_grid_unverified",
       "channels": [{
            "id": "ocean_color_index",
            "name": "Rendered Ocean Color Index",
            "type": "image_derived_index",
            "unit": None,
            "range": [0.0, 1.0],
            "description": (
                "Normalized hue index calculated from sufficiently saturated pixels "
                "in the rendered ECCO2 ocean visualization. "
                "Affected by flowline density and visualization styling; "
                "not a physical temperature measurement."
            )
        }],
        "normalization": {
            "method": "shared_linear",
            "source_min": 0.0,
            "source_max": 1.0
        },
        "sonification_profile": {
            "default_channel": "ocean_color_index",
            "scale": "pentatonic_major",
            "base_frequency": 220,
            "pitch_mapping": {
                "channel": "ocean_color_index",
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
                    "Pitch represents the rendered ocean color index, "
                    "not measured temperature or current speed."
                ),
                "stereo": "Horizontal image-grid position controls stereo panning.",
                "silence": (
                    "Cells without sufficient qualifying colored pixels are silent; "
                    "missing does not mean zero temperature."
                )
            }
        },
        "frames": frames,
        "processing": {
            "method": "HSV hue from saturated rendered pixels; block averaging",
            "grid": "64x32",
            "valid_pixel_rule": "RGB chroma > 25/255 and max RGB > 45/255",
            "minimum_colored_fraction": 0.05,
            "limitations": [
                "Hue is circular and arithmetic averages may cross the hue seam.",
                "Dark and gray ocean regions may be excluded.",
                "Colored flowline density affects the output.",
                "Grid cells are not independently georeferenced.",
                "Differences do not represent physical temperature change."
            ]
        },
        "source_frames": provenance
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    try:
        with open(temporary, "w", encoding="utf-8") as f:
            json.dump(dataset, f, indent=2, allow_nan=False)
        temporary.replace(OUTPUT)
    finally:
        temporary.unlink(missing_ok=True)

    print(f"Created: {OUTPUT}")


if __name__ == "__main__":
    main()
