"""Earth Echo NASA SVS media acquisition and video frame extraction.

Candidate URLs discovered by --query must be verified against the official SVS page.
The JSONL log is append-only; hashes establish local integrity, not NASA authenticity.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests

SOURCE_LOG_PATH = Path('raw_data/source_log.jsonl')
USER_AGENT = 'EarthEcho/1.1 (NASA Space Apps Challenge)'
MEDIA_EXTENSIONS = ('.mp4', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webm', '.mov', '.m4v')


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def append_source_log(entry):
    SOURCE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SOURCE_LOG_PATH.exists():
        # Reject a malformed pre-existing log rather than appending to it silently.
        with SOURCE_LOG_PATH.open('r', encoding='utf-8') as stream:
            for line_number, line in enumerate(stream, 1):
                try:
                    if not isinstance(json.loads(line), dict):
                        raise ValueError('record is not an object')
                except (ValueError, json.JSONDecodeError) as exc:
                    raise ValueError(f'Corrupt source log line {line_number}: {exc}') from exc
    record = dict(entry)
    record['logged_at'] = datetime.now(timezone.utc).isoformat()
    with SOURCE_LOG_PATH.open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    print(f' [Source Log] {SOURCE_LOG_PATH}')


def query_svs_assets(svs_id):
    if not re.fullmatch(r'\d+', str(svs_id)):
        raise ValueError('NASA SVS ID must contain digits only')
    page = f'https://svs.gsfc.nasa.gov/{svs_id}/'
    response = requests.get(page, headers={'User-Agent': USER_AGENT}, timeout=30)
    response.raise_for_status()
    # Discovery only: not a guarantee of completeness or suitability.
    pattern = r'''(?:href|src)\s*=\s*["']([^"']+)["']'''
    candidates = set()
    for link in re.findall(pattern, response.text, flags=re.I):
        absolute = urljoin(page, link)
        if urlparse(absolute).path.lower().endswith(MEDIA_EXTENSIONS):
            candidates.add(absolute)
    print(f'[SVS Query] {page}: {len(candidates)} candidate media links')
    for candidate in sorted(candidates):
        print(candidate)
    return sorted(candidates)


def download_file(url, output_path, description='', source_page=None):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.netloc:
        raise ValueError('Download URL must be HTTPS')
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise FileExistsError(f'Refusing to overwrite existing source: {destination}')
    temp_path = None
    try:
        with requests.get(url, headers={'User-Agent': USER_AGENT}, stream=True, timeout=(15, 90)) as response:
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '').split(';')[0].strip().lower()
            if content_type in {'text/html', 'application/json', 'text/plain'}:
                raise ValueError(f'Unexpected download Content-Type: {content_type}')
            with tempfile.NamedTemporaryFile(mode='wb', dir=destination.parent, prefix='.download-', delete=False) as stream:
                temp_path = Path(stream.name)
                size = 0
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        stream.write(chunk)
                        size += len(chunk)
                stream.flush()
                os.fsync(stream.fileno())
            if size == 0:
                raise ValueError('Download was empty')
            expected_length = response.headers.get('Content-Length')
            if expected_length is not None and size != int(expected_length):
                raise ValueError(f'Incomplete download: expected {expected_length} bytes, got {size}')
            digest = sha256_file(temp_path)
            # A checked response and non-empty body are not proof of media authenticity.
            os.replace(temp_path, destination)
            temp_path = None
        append_source_log({'action': 'download', 'source_url': url, 'source_page': source_page,
                           'local_path': str(destination), 'size_bytes': size,
                           'sha256': digest, 'content_type': content_type, 'description': description})
        print(f'[Download Complete] {destination} ({size} bytes, sha256={digest})')
        return str(destination)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def parse_timestamp(value):
    value = str(value).strip()
    if ':' in value:
        parts = value.split(':')
        if len(parts) != 3:
            raise ValueError(f'Invalid HH:MM:SS timestamp: {value}')
        hours, minutes, seconds = (float(part) for part in parts)
        if not all(math.isfinite(v) for v in (hours, minutes, seconds)) or not (0 <= minutes < 60 and 0 <= seconds < 60):
            raise ValueError(f'Invalid timestamp: {value}')
        result = hours * 3600 + minutes * 60 + seconds
    else:
        result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError(f'Invalid timestamp: {value}')
    return result


def extract_video_frames(video_path, timestamps, labels, output_dir='raw_data'):
    if len(timestamps) != len(labels) or not timestamps:
        raise ValueError('Provide equal nonzero counts of timestamps and labels')
    if any(not str(label).strip() or not re.fullmatch(r'[A-Za-z0-9_-]+', str(label)) for label in labels):
        raise ValueError('Labels must be non-empty and contain only letters, digits, underscores or hyphens')
    if len(set(labels)) != len(labels):
        raise ValueError('Frame labels must be unique')
    seconds = [parse_timestamp(ts) for ts in timestamps]
    source = Path(video_path)
    if not source.is_file():
        raise FileNotFoundError(source)
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError('Install OpenCV: python -m pip install opencv-python') from exc
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        capture.release()
        raise RuntimeError(f'Cannot open video: {source}')
    results = []
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if not math.isfinite(fps) or fps <= 0 or count <= 0:
            raise ValueError('Video has invalid frame rate or frame count')
        duration = count / fps
        source_hash = sha256_file(source)
        for timestamp, label, second in zip(timestamps, labels, seconds):
            frame_index = int(second * fps)
            if second >= duration or frame_index >= count:
                raise ValueError(f'Timestamp {timestamp} outside video duration {duration:.3f}s')
            path = output / f'svs_frame_{label}_{second:.3f}s.png'
            if path.exists():
                raise FileExistsError(f'Refusing to overwrite frame: {path}')
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            success, frame = capture.read()
            if not success:
                raise RuntimeError(f'Cannot read video frame {frame_index}')
            if not cv2.imwrite(str(path), frame):
                raise RuntimeError(f'Cannot write frame: {path}')
            frame_hash = sha256_file(path)
            append_source_log({'action': 'frame_extraction', 'source_video': str(source),
                               'source_sha256': source_hash, 'timestamp': str(timestamp),
                               'timestamp_seconds': second, 'frame_index': frame_index,
                               'output_path': str(path), 'sha256': frame_hash,
                               'dimensions': [int(frame.shape[1]), int(frame.shape[0])], 'label': label})
            results.append(str(path))
            print(f'[Extracted] {path}')
    finally:
        capture.release()
    return results


def main():
    parser = argparse.ArgumentParser(description='NASA SVS source acquisition and frame extraction')
    parser.add_argument('--query')
    parser.add_argument('--download')
    parser.add_argument('--output', default='raw_data/downloaded_asset.png')
    parser.add_argument('--source-page', help='Official NASA SVS source page for the selected asset')
    parser.add_argument('--video')
    parser.add_argument('--timestamps', nargs='+')
    parser.add_argument('--labels', nargs='+')
    args = parser.parse_args()
    if args.query:
        query_svs_assets(args.query)
    elif args.download:
        download_file(args.download, args.output, source_page=args.source_page)
    elif args.video:
        if not args.timestamps or not args.labels:
            parser.error('--video requires --timestamps and --labels')
        extract_video_frames(args.video, args.timestamps, args.labels)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()