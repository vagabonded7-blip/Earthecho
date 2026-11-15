"""
process_forest_data.py — Earth Echo Data Engineering
======================================================
Converts MODIS MOD13C2 monthly NDVI HDF4 composites into
Schema v1.1 JSON for the vegetation_ndvi_2020_2023 dataset.

Source: NASA MODIS Terra MOD13C2 Version 6.1
  Frame 0: MOD13C2.A2020001 — January 2020 monthly composite
  Frame 1: MOD13C2.A2023001 — January 2023 monthly composite

Scientific notes
----------------
- NDVI = (NIR - Red) / (NIR + Red), dimensionless, range [-1, 1].
- MOD13C2 valid_range stored as int16: [-2000, 10000] with scale_factor=10000.
  After scaling: NDVI ∈ [-0.2, 1.0]. Values below -0.2 are ocean, water, or
  persistently clouded pixels stored as the fill value -3000.
- Fill value -3000 (raw int16) → masked as NaN.
- NDVI < -0.2 after scaling is outside valid range → also masked as NaN.
- Shared linear normalization source_min=-0.2, source_max=1.0 is applied
  identically to both frames so relative magnitudes are preserved.
- Normalized value = (ndvi - (-0.2)) / (1.0 - (-0.2)), clipped to [0, 1].
- Grid cells with fewer than 25% valid (non-fill) source pixels are reported
  as null — the same threshold used for the ocean adapter.
- This is a physical measurement (NDVI), NOT a visualization-derived index.

Grid geometry
-------------
Source: 3600 rows (lat) × 7200 columns (lon), 0.05° CMG.
Target:   32 rows         ×   64 columns, uniform area average.
Block size: 3600/32 = 112.5 → 112 rows; 7200/64 = 112.5 → 112 columns.
Remainder pixels are dropped from the trailing edge — a documented choice that
drops <1 pixel worth of data at each edge, negligible for sonification.

Usage
-----
  python scripts/process_forest_data.py

Output
------
  public/data/vegetation_ndvi_2020_2023.json
  manifest entry added/updated for id "vegetation_ndvi_2020_2023"
"""

import json
import math
import os
import sys
from datetime import datetime

import numpy as np

try:
    from pyhdf.SD import SD, SDC
except ImportError:
    sys.exit(
        "[ERROR] pyhdf is not installed. Run: pip install pyhdf\n"
        "On Windows you may need a pre-built wheel from "
        "https://www.lfd.uci.edu/~gohlke/pythonlibs/#pyhdf"
    )

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RAW_DATA_DIR = os.path.join("raw_data", "forest")
OUTPUT_PATH = os.path.join("public", "data", "vegetation_ndvi_2020_2023.json")
MANIFEST_PATH = os.path.join("public", "data", "manifest.json")

SOURCES = [
    {
        "file": "MOD13C2.A2020001.061.2020328142931.hdf",
        "timestamp": "2020-01-01",
        "label": "January 2020",
    },
    {
        "file": "MOD13C2.A2023001.061.2023034191717.hdf",
        "timestamp": "2023-01-01",
        "label": "January 2023",
    },
]

HDF_DATASET_NAME = "CMG 0.05 Deg Monthly NDVI"
FILL_VALUE_RAW = -3000       # int16 fill in HDF4 product
SCALE_FACTOR = 10000.0       # documented MOD13C2 scale factor
NDVI_MIN = -0.2              # lower bound of valid NDVI range
NDVI_MAX = 1.0               # upper bound of valid NDVI range

# Shared normalization anchors — MUST be identical for both frames
# so that the same real-world NDVI maps to the same normalized value.
NORM_MIN = NDVI_MIN          # -0.2
NORM_MAX = NDVI_MAX          #  1.0

GRID_ROWS = 32
GRID_COLS = 64

# Source raster dimensions (CMG 0.05°)
SRC_ROWS = 3600
SRC_COLS = 7200

# Integer block size (trailing remainder is dropped — see docstring)
BLOCK_ROW = SRC_ROWS // GRID_ROWS   # 112
BLOCK_COL = SRC_COLS // GRID_COLS   # 112

# Minimum fraction of valid (non-fill) pixels required to report a cell value.
# Cells below this threshold are reported as null.
MIN_VALID_FRACTION = 0.25


# ---------------------------------------------------------------------------
# HDF4 reading
# ---------------------------------------------------------------------------

def read_ndvi_array(filepath: str) -> np.ndarray:
    """
    Open a MOD13C2 HDF4 file and return the NDVI layer as a float64 array
    with the fill value masked as NaN and NDVI scaled to real units.

    Returns
    -------
    ndarray of shape (3600, 7200), dtype float64
        Values in [-0.2, 1.0]; fill pixels are NaN.
    """
    if not os.path.isfile(filepath):
        sys.exit(f"[ERROR] Source file not found: {filepath}")

    print(f"  Opening: {filepath}")
    hdf = SD(filepath, SDC.READ)

    # Verify the expected dataset name exists
    datasets = hdf.datasets()
    if HDF_DATASET_NAME not in datasets:
        available = ", ".join(sorted(datasets.keys()))
        sys.exit(
            f"[ERROR] Dataset '{HDF_DATASET_NAME}' not found in HDF file.\n"
            f"  Available datasets: {available}"
        )

    sds = hdf.select(HDF_DATASET_NAME)
    raw = sds.get().astype(np.float64)   # read as float for masking
    sds.endaccess()
    hdf.end()

    print(f"  Raw shape: {raw.shape}, dtype: int16 → float64")
    print(f"  Fill value count (raw == {FILL_VALUE_RAW}): {int(np.sum(raw == FILL_VALUE_RAW))}")

    # --- Mask fill values BEFORE scaling ---
    # Using a boolean mask then NaN-assignment preserves int16 precision
    # and avoids accidental scale of fill value.
    fill_mask = raw == FILL_VALUE_RAW
    raw[fill_mask] = np.nan

    # --- Scale to real NDVI units ---
    ndvi = raw / SCALE_FACTOR

    # --- Mask values outside the documented valid range ---
    # Values just outside [-0.2, 1.0] can appear from compression artefacts.
    out_of_range = (~np.isnan(ndvi)) & ((ndvi < NDVI_MIN) | (ndvi > NDVI_MAX))
    if np.any(out_of_range):
        print(f"  Out-of-range pixels masked: {int(np.sum(out_of_range))}")
    ndvi[out_of_range] = np.nan

    valid_count = int(np.sum(~np.isnan(ndvi)))
    print(f"  Valid NDVI pixels: {valid_count:,} / {ndvi.size:,} "
          f"({100 * valid_count / ndvi.size:.1f}%)")
    print(f"  NDVI range (valid): [{float(np.nanmin(ndvi)):.4f}, {float(np.nanmax(ndvi)):.4f}]")

    return ndvi


# ---------------------------------------------------------------------------
# Area-based downsampling
# ---------------------------------------------------------------------------

def block_average_to_grid(ndvi: np.ndarray) -> list:
    """
    Downsample a (SRC_ROWS × SRC_COLS) NDVI array to (GRID_ROWS × GRID_COLS)
    using area-averaged blocks.

    Uses only the first (BLOCK_ROW * GRID_ROWS) rows and
    (BLOCK_COL * GRID_COLS) columns — the trailing remainder is dropped.
    This is documented behaviour, not a silent crop.

    Invalid/fill pixels (NaN) are excluded from the block mean.
    If fewer than MIN_VALID_FRACTION of a block's pixels are valid,
    the cell is reported as None (JSON null).

    Returns
    -------
    list of GRID_ROWS lists, each containing GRID_COLS float values or None.
    Floats are normalized to [0, 1] using shared NORM_MIN/NORM_MAX.
    Values are rounded to 4 decimal places.
    """
    # Restrict to the integer-block region (3584 × 7168 of 3600 × 7200)
    usable_rows = BLOCK_ROW * GRID_ROWS
    usable_cols = BLOCK_COL * GRID_COLS
    ndvi_crop = ndvi[:usable_rows, :usable_cols]

    total_pixels = BLOCK_ROW * BLOCK_COL
    null_cells = 0
    valid_cells = 0

    grid = []
    for row_idx in range(GRID_ROWS):
        row_data = []
        r0 = row_idx * BLOCK_ROW
        r1 = r0 + BLOCK_ROW
        for col_idx in range(GRID_COLS):
            c0 = col_idx * BLOCK_COL
            c1 = c0 + BLOCK_COL

            block = ndvi_crop[r0:r1, c0:c1]
            valid_pixels = block[~np.isnan(block)]
            valid_fraction = len(valid_pixels) / total_pixels

            if valid_fraction < MIN_VALID_FRACTION:
                row_data.append(None)
                null_cells += 1
            else:
                mean_ndvi = float(np.mean(valid_pixels))
                # Shared linear normalization
                norm = (mean_ndvi - NORM_MIN) / (NORM_MAX - NORM_MIN)
                # Clip to [0, 1] — rounding artefacts only
                norm = max(0.0, min(1.0, norm))
                row_data.append(round(norm, 4))
                valid_cells += 1

        grid.append(row_data)

    print(f"  Grid result: {valid_cells} valid cells, {null_cells} null cells "
          f"(of {GRID_ROWS * GRID_COLS} total)")
    return grid


# ---------------------------------------------------------------------------
# Schema v1.1 dataset assembly
# ---------------------------------------------------------------------------

def build_dataset(frames: list) -> dict:
    """
    Assemble a Schema v1.1 dataset dict from processed frame grids.

    Parameters
    ----------
    frames : list of dicts with keys: timestamp, label, grid
    """
    dataset = {
        "schema_version": "1.1",
        "id": "vegetation_ndvi_2020_2023",
        "title": "Global Vegetation (NDVI) — January 2020 vs January 2023",
        "source": {
            "organization": "NASA EOSDIS / USGS LP DAAC",
            "url": "https://lpdaac.usgs.gov/products/mod13c2v061/",
            "attribution": (
                "MODIS Terra MOD13C2 Version 6.1 monthly NDVI composite. "
                "Data courtesy of the NASA EOSDIS Land Processes DAAC (LP DAAC) "
                "at the USGS Earth Resources Observation and Science (EROS) Center."
            ),
            "disclaimer": (
                "NDVI is a dimensionless physical index, not a direct measurement of "
                "biomass or forest cover. January composites represent monthly maximum-value "
                "composites and may be affected by snow, cloud, or atmospheric conditions."
            ),
        },
        "width": GRID_COLS,
        "height": GRID_ROWS,
        "projection": "Geographic (EPSG:4326), CMG 0.05-degree equal-angle",
        "description": (
            "Normalized Difference Vegetation Index (NDVI) derived from MODIS Terra "
            "MOD13C2 Version 6.1 monthly composites. NDVI = (NIR - Red) / (NIR + Red). "
            "Values represent the maximum-value composite for January of each year. "
            "Ocean, water bodies, and persistently clouded areas are null. "
            "Shared normalization: source_min=-0.2, source_max=1.0."
        ),
        # Top-level normalization block (required by validator) — shared across all frames/channels
        "normalization": {
            "method": "shared_linear",
            "source_min": NORM_MIN,
            "source_max": NORM_MAX,
        },
        "channels": [
            {
                "id": "ndvi",
                "name": "Normalized Difference Vegetation Index",
                "type": "physical_measurement",
                "unit": "NDVI",
                "range": [0.0, 1.0],
                "description": (
                    "Dimensionless vegetation index. "
                    "0 = bare soil or water (NDVI \u2248 -0.2). "
                    "1 = dense, healthy vegetation (NDVI \u2248 1.0)."
                ),
            }
        ],
        "sonification_profile": {
            "default_channel": "ndvi",
            "scale": "pentatonic_major",
            "base_frequency": 220,
            "pitch_mapping": {
                "channel": "ndvi",
                "min_hz": 110,
                "max_hz": 880,
                "curve": "exponential",
            },
            "spatial_mapping": {
                "mode": "stereo_pan",
                "x_axis": "pan_left_to_right",
                "y_axis": "timbre_filter",
            },
            "legend": {
                "pitch": (
                    "Higher pitch indicates higher NDVI (denser vegetation). "
                    "Low pitch indicates sparse or absent vegetation."
                ),
                "stereo": "Horizontal grid position controls stereo panning (west = left, east = right).",
                "silence": "Silent cells are ocean, water bodies, or areas with persistent cloud cover.",
            },
        },
        "frames": [],
    }

    for frame_index, frame in enumerate(frames):
        dataset["frames"].append(
            {
                "frame_index": frame_index,
                "label": frame["label"],
                "timestamp": frame["timestamp"],
                "values": {
                    "ndvi": frame["grid"],
                },
            }
        )

    return dataset


# ---------------------------------------------------------------------------
# Manifest update
# ---------------------------------------------------------------------------

def update_manifest(manifest_path: str, dataset_id: str, output_path: str) -> None:
    """
    Add or update the vegetation_ndvi_2020_2023 entry in manifest.json.
    Preserves all existing entries.
    """
    if not os.path.isfile(manifest_path):
        manifest = {"schema_version": "1.1", "datasets": []}
    else:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

    # Normalise output path to forward-slash web path
    web_path = "/" + output_path.replace("\\", "/").lstrip("public/")
    if not web_path.startswith("/data/"):
        web_path = "/data/" + os.path.basename(output_path)

    new_entry = {
        "id": dataset_id,
        "label": "MODIS NDVI Global Vegetation 2020\u20132023",
        "path": web_path,
        "comparison_group": "vegetation",
    }

    datasets = manifest.get("datasets", [])
    # Replace existing entry with same id, or append
    replaced = False
    for i, entry in enumerate(datasets):
        if entry.get("id") == dataset_id:
            datasets[i] = new_entry
            replaced = True
            break
    if not replaced:
        datasets.append(new_entry)

    manifest["datasets"] = datasets

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    action = "Updated" if replaced else "Added"
    print(f"  {action} manifest entry: {dataset_id} → {web_path}")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_grid(grid: list, label: str) -> bool:
    """Quick structural validation of a produced grid."""
    ok = True
    if len(grid) != GRID_ROWS:
        print(f"  [FAIL] {label}: expected {GRID_ROWS} rows, got {len(grid)}")
        ok = False
    for r, row in enumerate(grid):
        if len(row) != GRID_COLS:
            print(f"  [FAIL] {label} row {r}: expected {GRID_COLS} cols, got {len(row)}")
            ok = False
            break
        for c, val in enumerate(row):
            if val is not None:
                if not (0.0 <= val <= 1.0):
                    print(f"  [FAIL] {label}[{r}][{c}] = {val} out of [0,1]")
                    ok = False
    if ok:
        null_count = sum(1 for row in grid for v in row if v is None)
        print(f"  [PASS] {label}: {GRID_ROWS}×{GRID_COLS} grid, {null_count} null cells")
    return ok


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("Earth Echo — Forest NDVI Pipeline")
    print(f"  Target grid: {GRID_ROWS} rows × {GRID_COLS} cols")
    print(f"  Block size:  {BLOCK_ROW} rows × {BLOCK_COL} cols per cell")
    print(f"  Shared normalization: [{NORM_MIN}, {NORM_MAX}]")
    print("=" * 60)

    frames = []
    all_valid = True

    for source in SOURCES:
        filepath = os.path.join(RAW_DATA_DIR, source["file"])
        print(f"\n[Frame] {source['label']} ({source['timestamp']})")
        print(f"  File: {source['file']}")

        ndvi = read_ndvi_array(filepath)
        grid = block_average_to_grid(ndvi)

        if not validate_grid(grid, source["label"]):
            all_valid = False

        frames.append(
            {
                "timestamp": source["timestamp"],
                "label": source["label"],
                "grid": grid,
            }
        )

    if not all_valid:
        sys.exit("\n[ERROR] Grid validation failed — output not written.")

    print(f"\n[Output] Building Schema v1.1 dataset...")
    dataset = build_dataset(frames)

    # Verify frame count
    assert len(dataset["frames"]) == 2, "Expected exactly 2 frames"

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    file_size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"  Written: {OUTPUT_PATH} ({file_size_kb:.1f} KB)")

    print(f"\n[Manifest] Updating {MANIFEST_PATH}...")
    update_manifest(MANIFEST_PATH, "vegetation_ndvi_2020_2023", OUTPUT_PATH)

    print("\n" + "=" * 60)
    print("[DONE] Forest NDVI pipeline complete.")
    print(f"  Run validation: python scripts/validate_dataset.py --manifest {MANIFEST_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
