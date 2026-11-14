
"""Earth Echo: NASA MOD13C2 monthly vegetation NDVI processor."""

import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from pyhdf.SD import SD, SDC

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw_data" / "forest"
OUTPUT = ROOT / "public" / "data" / "vegetation_modis_2020_2023.json"
TEMPLATE = ROOT / "public" / "data" / "night_lights_2012_2023.json"

WIDTH, HEIGHT = 64, 32
NDVI_LAYER = "CMG 0.05 Deg Monthly NDVI"
QA_LAYER = "CMG 0.05 Deg Monthly VI Quality"
RELIABILITY_LAYER = "CMG 0.05 Deg Monthly pixel reliability"

PERIODS = [
    ("2020", "2020-01-01T00:00:00Z", "MOD13C2.A2020001*.hdf"),
    ("2023", "2023-01-01T00:00:00Z", "MOD13C2.A2023001*.hdf"),
]


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_layer(hdf, name):
    dataset = hdf.select(name)
    try:
        return dataset[:], dataset.attributes()
    finally:
        dataset.endaccess()


def process_file(path):
    hdf = SD(str(path), SDC.READ)
    try:
        raw, attrs = read_layer(hdf, NDVI_LAYER)
        qa, qa_attrs = read_layer(hdf, QA_LAYER)
        reliability, _ = read_layer(hdf, RELIABILITY_LAYER)
    finally:
        hdf.end()

    if raw.shape != (3600, 7200):
        raise ValueError(f"Unexpected NDVI dimensions: {raw.shape}")

    if qa.shape != raw.shape or reliability.shape != raw.shape:
        raise ValueError("NDVI and QA dimensions do not match")

    if float(attrs["scale_factor"]) != 10000.0:
        raise ValueError("Unexpected NDVI scale factor")

    if int(attrs["_FillValue"]) != -3000:
        raise ValueError("Unexpected NDVI fill value")

    if int(qa_attrs["_FillValue"]) != 65535:
        raise ValueError("Unexpected QA fill value")

    raw_min, raw_max = map(int, attrs["valid_range"])

    # MODLAND_QA bits 0-1: 00 = good quality.
    modland = qa & 0b11

    # Land/water bits 11-13: 001 = land.
    land = (qa >> 11) & 0b111

    # Pixel reliability 0 = good data.
    valid = (
        (raw >= raw_min)
        & (raw <= raw_max)
        & (raw != int(attrs["_FillValue"]))
        & (qa != 65535)
        & (modland == 0)
        & (land == 1)
        & (reliability == 0)
    )

    ndvi = raw.astype(np.float32) / 10000.0

    # Shared fixed normalization: [-0.2, 1.0] -> [0, 1].
    normalized = (ndvi + 0.2) / 1.2

    y_edges = np.linspace(0, 3600, HEIGHT + 1, dtype=int)
    x_edges = np.linspace(0, 7200, WIDTH + 1, dtype=int)

    grid = []
    valid_cells = 0

    for y in range(HEIGHT):
        row = []
        y0, y1 = y_edges[y:y + 2]

        for x in range(WIDTH):
            x0, x1 = x_edges[x:x + 2]

            block_valid = valid[y0:y1, x0:x1]
            coverage = float(block_valid.mean())

            if coverage < 0.05:
                row.append(None)
                continue

            block_values = normalized[y0:y1, x0:x1]
            value = float(block_values[block_valid].mean())

            row.append(round(value, 6))
            valid_cells += 1

        grid.append(row)

    return grid, valid_cells


def main():
    with TEMPLATE.open("r", encoding="utf-8") as stream:
        template = json.load(stream)

    dataset = {
        "schema_version": "1.1",
        "id": "vegetation_modis_2020_2023",
        "title": "NASA MODIS Monthly Vegetation NDVI: January 2020 and 2023",
        "description": "NASA MODIS Terra monthly vegetation greenness (NDVI) comparison for January 2020 and January 2023.",
        "width": 64,
        "height": 32,
        "source": {
            "organization": "NASA LP DAAC / MODIS Terra",
            "url": "https://lpdaac.usgs.gov/products/mod13c2v061/",
            "attribution": "NASA MOD13C2 Version 6.1 vegetation indices.",
            "disclaimer": (
                "Satellite-derived vegetation greenness index. "
                "NDVI is not a direct measurement of forest cover, "
                "forest height, or deforestation. Quality filtering "
                "and coarse spatial averaging may exclude observations."
            ),
        },
        "channels": [{
            "id": "ndvi",
            "name": "Vegetation Greenness (NDVI)",
            "type": "normalized_index",
            "unit": None,
            "range": [0.0, 1.0],
            "description": (
                "Quality-filtered MODIS NDVI, originally ranging "
                "from -0.2 to 1.0, normalized to [0,1] "
                "using a shared fixed scale. "
                "Higher values generally indicate greener vegetation."
            ),
        }],
        "normalization": {
            "method": "shared_linear",
            "source_min": -0.2,
            "source_max": 1.0,
        },
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
                    "Higher pitch indicates higher vegetation NDVI, "
                    "not directly greater forest cover."
                ),
                "stereo": (
                    "Horizontal geographic grid position controls stereo panning."
                ),
                "silence": (
                    "Cells with insufficient valid observations are silent; "
                    "missing does not mean zero vegetation."
                ),
            },
        },
        "frames": [],
    }

    # Preserve the established grid metadata structure.
    for key in ("grid", "projection", "grid_width", "grid_height"):
        if key in template:
            dataset[key] = copy.deepcopy(template[key])

    # Preserve any required spatial dimensions from the existing schema.
    # Replace image-specific projection metadata when present.
    if "projection" in dataset:
        dataset["projection"] = "equirectangular"

    source_files = []

    for index, (year, timestamp, pattern) in enumerate(PERIODS):
        matches = sorted(RAW.glob(pattern))
        if len(matches) != 1:
            raise FileNotFoundError(
                f"Expected one file matching {pattern}; found {len(matches)}"
            )

        path = matches[0]
        grid, count = process_file(path)

        dataset["frames"].append({
            "frame_index": index,
            "label": f"January {year}",
            "timestamp": timestamp,
            "values": {"ndvi": grid},
        })

        source_files.append({
            "filename": path.name,
            "sha256": file_hash(path),
            "timestamp": timestamp,
        })

        print(f"{year}: {count}/{WIDTH * HEIGHT} valid grid cells")

    dataset["processing"] = {
        "method": "QA-filtered mean of MODIS monthly NDVI per grid cell",
        "grid_size": [WIDTH, HEIGHT],
        "minimum_valid_fraction": 0.05,
        "quality_filter": (
            "MODLAND_QA=0, pixel_reliability=0, "
            "land_water_flag=1, valid NDVI range"
        ),
        "limitations": (
            "Global coarse-grid NDVI is not forest-only. "
            "Unequal valid-pixel coverage between years may affect "
            "comparisons. Cells represent unweighted averages of "
            "valid source pixels, not equal-area averages."
        ),
        "source_files": source_files,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")

    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(dataset, stream, indent=2, allow_nan=False)

    temporary.replace(OUTPUT)
    print(f"Created: {OUTPUT}")


if __name__ == "__main__":
    main()
