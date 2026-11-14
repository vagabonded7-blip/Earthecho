"""Earth Echo: NASA visualization-derived brightness grids (Schema v1.1)."""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

import numpy as np
from process_image import preprocess_and_extract_luminance

TARGET_WIDTH, TARGET_HEIGHT = 64, 32
SOURCE_MIN, SOURCE_MAX = 0.0, 255.0
PUBLIC = Path('public').resolve()


def block_average_to_grid(luma_matrix, target_w=TARGET_WIDTH, target_h=TARGET_HEIGHT):
    if not isinstance(luma_matrix, np.ndarray) or luma_matrix.ndim != 2:
        raise ValueError('Expected a 2D NumPy array')
    height, width = luma_matrix.shape
    if target_w <= 0 or target_h <= 0 or height < target_h or width < target_w:
        raise ValueError('Invalid target grid or input image dimensions')
    grid = []
    for y in range(target_h):
        row = []
        y0, y1 = int(y * height / target_h), int((y + 1) * height / target_h)
        for x in range(target_w):
            x0, x1 = int(x * width / target_w), int((x + 1) * width / target_w)
            pixels = luma_matrix[y0:y1, x0:x1]
            valid = pixels[np.isfinite(pixels)]
            if valid.size == 0:
                row.append(None)
            else:
                mean = float(np.mean(valid))
                if not SOURCE_MIN <= mean <= SOURCE_MAX:
                    raise ValueError(f'Display-luma value outside {SOURCE_MIN}–{SOURCE_MAX}')
                row.append(round((mean - SOURCE_MIN) / (SOURCE_MAX - SOURCE_MIN), 4))
        grid.append(row)
    return grid


def atomic_json_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix='.earth_echo_', suffix='.tmp', delete=False) as file:
            temp_name = file.name
            json.dump(data, file, indent=2, ensure_ascii=False, allow_nan=False)
            file.write('\n')
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def public_web_path(path):
    resolved = Path(path).resolve()
    try:
        relative = resolved.relative_to(PUBLIC)
    except ValueError as exc:
        raise ValueError('Dataset output must be inside public/') from exc
    if not resolved.is_file() or resolved.suffix.lower() != '.json':
        raise ValueError('Dataset output must be an existing JSON file')
    return '/' + relative.as_posix()


def update_manifest(dataset_id, file_path, label, group='night_lights'):
    manifest_path = PUBLIC / 'data' / 'manifest.json'
    manifest = {'schema_version': '1.1', 'datasets': []}
    if manifest_path.exists():
        with manifest_path.open(encoding='utf-8') as file:
            manifest = json.load(file)
    if not isinstance(manifest, dict) or manifest.get('schema_version') != '1.1':
        raise ValueError('Manifest must be a Schema v1.1 object')
    entries = manifest.get('datasets')
    if not isinstance(entries, list):
        raise ValueError('Manifest datasets must be a list')
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict) or any(not isinstance(entry.get(k), str) or not entry[k].strip()
                                             for k in ('id', 'path', 'label', 'comparison_group')):
            raise ValueError('Malformed manifest entry')
        if entry['id'] in seen:
            raise ValueError(f'Duplicate manifest dataset ID: {entry["id"]}')
        seen.add(entry['id'])
    web_path = public_web_path(file_path)
    manifest['datasets'] = [entry for entry in entries if entry['id'] != dataset_id]
    manifest['datasets'].append({'id': dataset_id, 'path': web_path,
                                 'label': label, 'comparison_group': group})
    atomic_json_write(manifest_path, manifest)
    print(f'[Manifest Updated] {manifest_path}')


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def build_schema_v11_dataset(dataset_id, title, frames_data,
                             source_url='https://svs.gsfc.nasa.gov/5313/',
                             attribution='NASA Scientific Visualization Studio; source asset attribution must be verified.',
                             description='NASA Night Lights 2012–2023 visualization-derived brightness comparison.',
                             processing_inputs=None):
    return {
        'schema_version': '1.1', 'id': dataset_id, 'title': title,
        'source': {
            'organization': 'NASA Goddard Space Flight Center / Scientific Visualization Studio',
            'url': source_url, 'attribution': attribution,
            'disclaimer': 'Visualization-derived display-luma index; not calibrated satellite radiance.'
        },
        'width': TARGET_WIDTH, 'height': TARGET_HEIGHT,
        'projection': 'image_grid_unverified', 'description': description,
        'channels': [{
            'id': 'brightness', 'name': 'Visualization Brightness Index',
            'type': 'image_derived_index', 'unit': None, 'range': [0.0, 1.0],
            'description': 'BT.709-weighted display luma from rendered NASA imagery; includes background graphics.'
        }],
        'normalization': {'method': 'shared_linear', 'source_min': SOURCE_MIN, 'source_max': SOURCE_MAX},
        'sonification_profile': {
            'default_channel': 'brightness', 'scale': 'pentatonic_major', 'base_frequency': 220,
            'pitch_mapping': {'channel': 'brightness', 'min_hz': 110, 'max_hz': 880, 'curve': 'exponential'},
            'spatial_mapping': {'mode': 'stereo_pan', 'x_axis': 'pan_left_to_right', 'y_axis': 'timbre_filter'},
            'legend': {
                'pitch': 'Higher pitch indicates higher visualization-derived brightness, not measured radiance.',
                'stereo': 'Horizontal image-grid position controls stereo panning.',
                'silence': 'Missing or invalid cells are silent; missing is not zero brightness.'
            }
        },
        'processing': {
            'method': 'block_average_to_grid', 'input_type': 'rendered_visualization',
            'display_luma': 'BT.709 weighted gamma-encoded RGB',
            'polar_mask_percent': 0.0, 'crop_margins_in_this_step': [0, 0, 0, 0],
            'geographic_alignment': 'visually_checked_not_georeferenced',
            'input_files': processing_inputs or [],
            'note': 'Input checksums cover cropped PNGs, not original NASA downloads. Verify source provenance separately.'
        },
        'frames': frames_data
    }


def main():
    parser = argparse.ArgumentParser(description='Generate Schema v1.1 brightness dataset')
    parser.add_argument('--id', default='night_lights_2012_2023')
    parser.add_argument('--title', default='NASA Night Lights 2012–2023')
    parser.add_argument('--inputs', nargs='+', required=True)
    parser.add_argument('--labels', nargs='+', required=True)
    parser.add_argument('--timestamps', nargs='+', required=True)
    parser.add_argument('--output', default='public/data/night_lights_2012_2023.json')
    parser.add_argument('--group', default='night_lights')
    parser.add_argument('--source-url', default='https://svs.gsfc.nasa.gov/5313/')
    parser.add_argument('--no-manifest', action='store_true', help='Do not change manifest (recommended for test output)')
    args = parser.parse_args()
    if not args.inputs or len(args.inputs) != len(args.labels) or len(args.inputs) != len(args.timestamps):
        parser.error('--inputs, --labels and --timestamps must have matching nonzero lengths')
    frames, inputs = [], []
    for index, (path, label, timestamp) in enumerate(zip(args.inputs, args.labels, args.timestamps)):
        if not label.strip() or not timestamp.strip():
            parser.error('Frame labels and timestamps must not be empty')
        print(f'[Processing] {label}: {path}')
        luma = preprocess_and_extract_luminance(path, mask_polar_rows_percent=0.0)
        frames.append({'frame_index': index, 'label': label, 'timestamp': timestamp,
                       'values': {'brightness': block_average_to_grid(luma)}})
        inputs.append({'filename': Path(path).name, 'sha256': sha256(path),
                       'size_bytes': Path(path).stat().st_size,
                       'width': int(luma.shape[1]), 'height': int(luma.shape[0])})
    dataset = build_schema_v11_dataset(args.id, args.title, frames, args.source_url,
                                      processing_inputs=inputs)
    # Check output before writing. Never change production JSON during a test unless explicitly requested.
    output = Path(args.output)
    if not args.no_manifest:
        try:
            output.resolve().relative_to(PUBLIC)
        except ValueError:
            parser.error('Manifest registration requires output inside public/; use --no-manifest for test output')
    atomic_json_write(output, dataset)
    print(f'[Export Success] {output}')
    if not args.no_manifest:
        update_manifest(args.id, str(output), args.title, args.group)


if __name__ == '__main__':
    main()
