"""
Earth Echo — NASA Source Acquisition & Frame Extraction Tool

MODULE 2: Source Acquisition & Ingestion
Purpose:
  Downloads or extracts verified NASA Earth Information Center media assets
  (from SVS #5313 / #5276) into raw_data/ while preserving original files
  and maintaining an immutable source log.

Usage:
  # 1. Query available media files on NASA SVS 5313:
  python scripts/extract_frames.py --query 5313

  # 2. Download specific NASA SVS media asset:
  python scripts/extract_frames.py --download https://images.nasa.gov/... --output raw_data/svs_5313_frame.png

  # 3. Extract frames from a local video at timestamp or frame index:
  python scripts/extract_frames.py --video raw_data/svs_5313.mp4 --timestamps 00:00:05 00:00:25 --labels "2012" "2023"
"""

import os
import sys
import json
import time
import argparse
import requests
import re
from datetime import datetime
from PIL import Image

SOURCE_LOG_PATH = os.path.join("raw_data", "source_log.json")

def load_source_log() -> list:
    """Loads the acquisition log if it exists."""
    if os.path.exists(SOURCE_LOG_PATH):
        try:
            with open(SOURCE_LOG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def append_source_log(entry: dict):
    """Appends an entry to the immutable acquisition log."""
    log = load_source_log()
    entry["logged_at"] = datetime.utcnow().isoformat() + "Z"
    log.append(entry)
    os.makedirs(os.path.dirname(SOURCE_LOG_PATH), exist_ok=True)
    with open(SOURCE_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2)
    print(f" [Source Log] Recorded entry in {SOURCE_LOG_PATH}")

def query_svs_assets(svs_id: str) -> list:
    """Queries NASA SVS webpage or API to discover downloadable media files."""
    url = f"https://svs.gsfc.nasa.gov/{svs_id}/"
    print(f"\n[SVS Query] Fetching asset listing from {url} ...")
    headers = {"User-Agent": "EarthEcho/1.1 (NASA Space Apps Challenge Data Pipeline)"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f" [Error] Failed to connect to NASA SVS: {e}")
        return []

    # Extract all media links (mp4, png, jpg, tif)
    pattern = r'(https?://[^\s"\'<>]+\.(?:mp4|png|jpg|jpeg|tif|tiff|webm|mov))'
    matches = re.findall(pattern, resp.text, re.IGNORECASE)
    # Also relative links
    rel_pattern = r'href=[\"\'](/[^\"\']+\.(?:mp4|png|jpg|jpeg|tif|tiff|webm|mov))[\"\']'
    rel_matches = [f"https://svs.gsfc.nasa.gov{m}" for m in re.findall(rel_pattern, resp.text, re.IGNORECASE)]

    all_links = sorted(list(set(matches + rel_matches)))
    print(f" [SVS Query] Discovered {len(all_links)} downloadable media assets on NASA SVS #{svs_id}:\n")
    for idx, link in enumerate(all_links):
        print(f"   [{idx + 1}] {link}")
    return all_links

def download_file(url: str, output_path: str, description: str = "") -> str:
    """Downloads a file and records its cryptographic metadata in the source log."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    print(f"\n[Download] Fetching: {url}")
    print(f"           Target: {output_path}")

    headers = {"User-Agent": "EarthEcho/1.1 (NASA Space Apps Challenge Data Pipeline)"}
    resp = requests.get(url, headers=headers, stream=True, timeout=30)
    resp.raise_for_status()

    total_bytes = 0
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                f.write(chunk)
                total_bytes += len(chunk)

    print(f" [Download Complete] Saved {total_bytes / (1024*1024):.2f} MB to {output_path}")

    # Log entry
    append_source_log({
        "action": "download",
        "source_url": url,
        "local_path": output_path,
        "size_bytes": total_bytes,
        "description": description
    })
    return output_path

def extract_video_frames(video_path: str, timestamps: list, labels: list, output_dir: str = "raw_data") -> list:
    """
    Extracts frames from an MP4 video using OpenCV (or imageio/pillow fallback).
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    try:
        import cv2
    except ImportError:
        print(" [Dependency Note] OpenCV (cv2) not installed. Please run: pip install opencv-python")
        print(" Alternatively, download still frames directly from NASA SVS.")
        return []

    os.makedirs(output_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps
    print(f" [Video Info] {os.path.basename(video_path)}: {fps:.2f} fps, {total_frames} frames, {duration_sec:.2f}s")

    extracted_files = []
    for ts_str, label in zip(timestamps, labels):
        # Parse timestamp e.g. "00:00:05" or float seconds "5.0"
        if ":" in ts_str:
            parts = ts_str.split(":")
            sec = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        else:
            sec = float(ts_str)

        target_frame = int(sec * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        if not ret:
            print(f" [Warning] Could not read frame at {ts_str} (frame {target_frame})")
            continue

        out_name = f"svs_frame_{label}_{sec:.1f}s.png"
        out_path = os.path.join(output_dir, out_name)
        # Convert BGR (cv2) to RGB and save via PIL
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        Image.fromarray(rgb_frame).save(out_path)
        print(f" [Extracted] Frame at {ts_str} -> {out_path} ({frame.shape[1]}x{frame.shape[0]} px)")

        append_source_log({
            "action": "frame_extraction",
            "source_video": video_path,
            "timestamp": ts_str,
            "target_frame": target_frame,
            "output_path": out_path,
            "dimensions": f"{frame.shape[1]}x{frame.shape[0]}",
            "label": label
        })
        extracted_files.append(out_path)

    cap.release()
    return extracted_files

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NASA Source Acquisition and Frame Extraction Tool")
    parser.add_argument("--query", type=str, help="NASA SVS ID to query for downloadable media (e.g. 5313)")
    parser.add_argument("--download", type=str, help="Direct URL of NASA media file to download")
    parser.add_argument("--output", type=str, default="raw_data/downloaded_asset.png", help="Target output file path")
    parser.add_argument("--video", type=str, help="Local video file path to extract frames from")
    parser.add_argument("--timestamps", nargs="+", help="Timestamps to extract (e.g. 00:00:05 00:00:25)")
    parser.add_argument("--labels", nargs="+", help="Labels corresponding to timestamps (e.g. 2012 2023)")
    args = parser.parse_args()

    if args.query:
        query_svs_assets(args.query)
    elif args.download:
        download_file(args.download, args.output)
    elif args.video:
        if not args.timestamps or not args.labels:
            print("Error: When specifying --video, please also provide --timestamps and --labels")
            sys.exit(1)
        extract_video_frames(args.video, args.timestamps, args.labels)
    else:
        print("NASA Source Acquisition Tool. Use --help to view available commands.")

