"""
Earth Echo — Dataset Validation Suite (Python)

MODULE 9: Automated Schema v1.1 and Dataset Verification
Audits:
  1. JSON parsing and structure.
  2. schema_version == "1.1".
  3. Exact dimensions: 32 rows x 64 columns across all frames and channels.
  4. Numerical value bounds (valid floats within declared range or None/null).
  5. Polar/null cell representation.
  6. Required metadata fields (source, attribution, sonification_profile).
  7. Shared normalization limits.
  8. Manifest consistency (ensures every listed dataset exists on disk).

Usage:
  python scripts/validate_dataset.py --file public/data/night_lights_2012_2023.json
  python scripts/validate_dataset.py --manifest public/data/manifest.json
"""

import os
import sys
import json
import argparse

EXPECTED_WIDTH = 64
EXPECTED_HEIGHT = 32

def validate_dataset_file(file_path: str) -> bool:
    print(f"\n=======================================================")
    print(f" DATASET INTEGRITY AUDIT: {os.path.basename(file_path)}")
    print(f"=======================================================")

    if not os.path.exists(file_path):
        print(f" [FAIL] File does not exist: {file_path}")
        return False

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f" [FAIL] JSON Parse Error: {e}")
        return False

    errors = []

    # 1. Schema Version
    if data.get("schema_version") != "1.1":
        errors.append(f"Invalid schema_version: expected '1.1', received '{data.get('schema_version')}'")

    # 2. Dimensions
    if data.get("width") != EXPECTED_WIDTH or data.get("height") != EXPECTED_HEIGHT:
        errors.append(f"Dimension mismatch: expected {EXPECTED_WIDTH}x{EXPECTED_HEIGHT}, got {data.get('width')}x{data.get('height')}")

    # 3. Required Metadata
    for req in ["id", "title", "source", "channels", "sonification_profile", "frames"]:
        if req not in data:
            errors.append(f"Missing top-level key: '{req}'")

    # 4. Source Metadata
    src = data.get("source", {})
    if not src.get("organization") or not src.get("url") or not src.get("attribution"):
        errors.append("source must contain 'organization', 'url', and 'attribution'")

    # 5. Normalization Metadata
    norm = data.get("normalization", {})
    if norm.get("source_min") is None or norm.get("source_max") is None:
        errors.append("normalization must define 'source_min' and 'source_max'")

    # 6. Frames and Channels
    frames = data.get("frames", [])
    channels = data.get("channels", [])
    if not isinstance(frames, list) or len(frames) == 0:
        errors.append("frames must be a non-empty list")
    if not isinstance(channels, list) or len(channels) == 0:
        errors.append("channels must be a non-empty list")

    channel_ranges = {c.get("id"): c.get("range", [-float("inf"), float("inf")]) for c in channels if "id" in c}

    for f_idx, frame in enumerate(frames):
        if "frame_index" not in frame or "label" not in frame or "values" not in frame:
            errors.append(f"Frame [{f_idx}] missing required keys (frame_index, label, values)")
            continue

        values = frame["values"]
        for ch_id, ch_range in channel_ranges.items():
            if ch_id not in values:
                errors.append(f"Frame [{f_idx}] missing grid for channel '{ch_id}'")
                continue

            grid = values[ch_id]
            if len(grid) != EXPECTED_HEIGHT:
                errors.append(f"Frame [{f_idx}] channel '{ch_id}' row count must be {EXPECTED_HEIGHT}, got {len(grid)}")
                continue

            for y, row in enumerate(grid):
                if len(row) != EXPECTED_WIDTH:
                    errors.append(f"Frame [{f_idx}] channel '{ch_id}' row {y} col count must be {EXPECTED_WIDTH}, got {len(row)}")
                    break
                for x, val in enumerate(row):
                    if val is not None:
                        if not isinstance(val, (int, float)):
                            errors.append(f"Frame [{f_idx}] cell [{y}][{x}] invalid non-number: {val}")
                            break
                        if val < ch_range[0] or val > ch_range[1]:
                            errors.append(f"Frame [{f_idx}] cell [{y}][{x}] value {val} out of bounds [{ch_range[0]}, {ch_range[1]}]")
                            break

    if errors:
        print(f" [FAIL] Found {len(errors)} validation errors:")
        for err in errors[:10]:
            print(f"   - {err}")
        if len(errors) > 10:
            print(f"   ... and {len(errors) - 10} more.")
        return False
    else:
        print(f" [PASS] Valid Schema v1.1 dataset!")
        print(f"        Frames: {len(frames)}, Channels: {list(channel_ranges.keys())}")
        print(f"        Dimensions: {data['width']} x {data['height']}")
        return True

def validate_manifest_file(manifest_path: str = "public/data/manifest.json") -> bool:
    print(f"\n=======================================================")
    print(f" MANIFEST INTEGRITY AUDIT: {manifest_path}")
    print(f"=======================================================")

    if not os.path.exists(manifest_path):
        print(f" [FAIL] Manifest not found: {manifest_path}")
        return False

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    if manifest.get("schema_version") != "1.1":
        print(f" [FAIL] Manifest schema_version is '{manifest.get('schema_version')}', expected '1.1'")
        return False

    datasets = manifest.get("datasets", [])
    print(f" Manifest registers {len(datasets)} dataset(s).")

    all_valid = True
    for ds in datasets:
        ds_id = ds.get("id")
        web_path = ds.get("path")
        local_path = os.path.join("public", web_path.lstrip("/"))

        print(f" Checking: {ds_id} -> {local_path}")
        if not os.path.exists(local_path):
            print(f"   [FAIL] Target file does not exist on disk: {local_path}")
            all_valid = False
            continue

        if not validate_dataset_file(local_path):
            all_valid = False

    return all_valid

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit and validate Earth Echo datasets.")
    parser.add_argument("--file", type=str, help="Dataset JSON file to validate")
    parser.add_argument("--manifest", type=str, default="public/data/manifest.json", help="Manifest JSON file to validate")
    args = parser.parse_args()

    if args.file:
        success = validate_dataset_file(args.file)
        sys.exit(0 if success else 1)
    else:
        success = validate_manifest_file(args.manifest)
        sys.exit(0 if success else 1)

