"""Validate Earth Echo Schema v1.1 JSON datasets and manifest."""
import argparse
import json
import math
import sys
from pathlib import Path

WIDTH, HEIGHT = 64, 32


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def read_json(path):
    def reject_constant(value):
        raise ValueError(f'Non-standard JSON numeric constant: {value}')
    with Path(path).open(encoding='utf-8') as file:
        return json.load(file, parse_constant=reject_constant)


def validate_dataset(data):
    errors = []
    if not isinstance(data, dict):
        return ['Dataset root must be a JSON object']
    if data.get('schema_version') != '1.1':
        errors.append('schema_version must be 1.1')
    for key in ('id', 'title', 'description', 'projection'):
        if not nonempty(data.get(key)):
            errors.append(f'{key} must be a nonempty string')
    if type(data.get('width')) is not int or data['width'] != WIDTH or type(data.get('height')) is not int or data['height'] != HEIGHT:
        errors.append(f'Grid dimensions must be {WIDTH}x{HEIGHT}')

    source = data.get('source')
    if not isinstance(source, dict):
        errors.append('source must be an object')
    else:
        for key in ('organization', 'url', 'attribution', 'disclaimer'):
            if not nonempty(source.get(key)):
                errors.append(f'source.{key} must be a nonempty string')

    norm = data.get('normalization')
    if not isinstance(norm, dict):
        errors.append('normalization must be an object')
    else:
        if norm.get('method') != 'shared_linear':
            errors.append('normalization.method must be shared_linear')
        lo, hi = norm.get('source_min'), norm.get('source_max')
        if not number(lo) or not number(hi) or lo >= hi:
            errors.append('normalization source_min/source_max must be finite numbers with min < max')

    channels = data.get('channels')
    channel_ids = []
    ranges = {}
    if not isinstance(channels, list) or not channels:
        errors.append('channels must be a nonempty list')
        channels = []
    for i, channel in enumerate(channels):
        if not isinstance(channel, dict):
            errors.append(f'channels[{i}] must be an object')
            continue
        for key in ('id', 'name', 'type', 'description'):
            if not nonempty(channel.get(key)):
                errors.append(f'channels[{i}].{key} must be a nonempty string')
        unit = channel.get('unit')
        if unit is not None and not isinstance(unit, str):
            errors.append(f'channels[{i}].unit must be string or null')
        ident = channel.get('id')
        if not nonempty(ident):
            continue
        if ident in channel_ids:
            errors.append(f'Duplicate channel ID: {ident}')
        channel_ids.append(ident)
        rng = channel.get('range')
        if not isinstance(rng, list) or len(rng) != 2 or not all(number(v) for v in rng) or rng[0] >= rng[1]:
            errors.append(f'channels[{i}].range must be [finite_min, finite_max]')
        else:
            ranges[ident] = rng

    profile = data.get('sonification_profile')
    if not isinstance(profile, dict):
        errors.append('sonification_profile must be an object')
    else:
        if profile.get('default_channel') not in channel_ids:
            errors.append('sonification_profile.default_channel must refer to a channel')
        if not nonempty(profile.get('scale')) or not number(profile.get('base_frequency')) or profile['base_frequency'] <= 0:
            errors.append('sonification_profile requires scale and positive base_frequency')
        pitch = profile.get('pitch_mapping')
        if not isinstance(pitch, dict) or pitch.get('channel') not in channel_ids or not all(number(pitch.get(k)) for k in ('min_hz', 'max_hz')) or not number(pitch.get('min_hz')) or pitch['min_hz'] <= 0 or pitch['min_hz'] >= pitch['max_hz'] or not nonempty(pitch.get('curve')):
            errors.append('sonification_profile.pitch_mapping is invalid')
        spatial = profile.get('spatial_mapping')
        if not isinstance(spatial, dict) or not all(nonempty(spatial.get(k)) for k in ('mode', 'x_axis', 'y_axis')):
            errors.append('sonification_profile.spatial_mapping is invalid')
        legend = profile.get('legend')
        if not isinstance(legend, dict) or not all(nonempty(legend.get(k)) for k in ('pitch', 'stereo', 'silence')):
            errors.append('sonification_profile.legend is invalid')

    frames = data.get('frames')
    if not isinstance(frames, list) or not frames:
        errors.append('frames must be a nonempty list')
        frames = []
    indices = []
    for fi, frame in enumerate(frames):
        if not isinstance(frame, dict):
            errors.append(f'frames[{fi}] must be an object')
            continue
        idx = frame.get('frame_index')
        if type(idx) is not int or idx < 0:
            errors.append(f'frames[{fi}].frame_index must be a nonnegative integer')
        else:
            indices.append(idx)
            if idx != fi:
                errors.append(f'frames[{fi}].frame_index must equal {fi}')
        if not nonempty(frame.get('label')) or not nonempty(frame.get('timestamp')):
            errors.append(f'frames[{fi}] requires nonempty label and timestamp')
        else:
            stamp = frame['timestamp']
            if not (stamp.isdigit() and len(stamp) == 4) and not _iso_timestamp(stamp):
                errors.append(f'frames[{fi}].timestamp must be YYYY or ISO date/time')
        values = frame.get('values')
        if not isinstance(values, dict):
            errors.append(f'frames[{fi}].values must be an object')
            continue
        for ch in channel_ids:
            grid = values.get(ch)
            if not isinstance(grid, list) or len(grid) != HEIGHT:
                errors.append(f'frames[{fi}].values.{ch} must contain {HEIGHT} rows')
                continue
            for y, row in enumerate(grid):
                if not isinstance(row, list) or len(row) != WIDTH:
                    errors.append(f'frames[{fi}].values.{ch}[{y}] must contain {WIDTH} cells')
                    continue
                for x, val in enumerate(row):
                    if val is None:
                        continue
                    if not number(val):
                        errors.append(f'frames[{fi}].values.{ch}[{y}][{x}] must be finite number or null')
                    elif ch in ranges and not ranges[ch][0] <= val <= ranges[ch][1]:
                        errors.append(f'frames[{fi}].values.{ch}[{y}][{x}] outside channel range')
        if set(values) != set(channel_ids):
            errors.append(f'frames[{fi}] channel grid IDs do not match channels list')
    if len(indices) != len(set(indices)):
        errors.append('Duplicate frame indices')
    return errors


def _iso_timestamp(value):
    from datetime import datetime
    try:
        datetime.fromisoformat(value.replace('Z', '+00:00'))
        return True
    except ValueError:
        return False


def validate_dataset_file(file_path):
    print(f'\n[Dataset Audit] {file_path}')
    try:
        errors = validate_dataset(read_json(file_path))
    except (OSError, ValueError, TypeError) as exc:
        errors = [str(exc)]
    if errors:
        for message in errors[:20]:
            print(' [FAIL]', message)
        if len(errors) > 20:
            print(f' ... {len(errors) - 20} additional errors')
        return False
    print(' [PASS] Valid Schema v1.1 dataset')
    return True


def validate_manifest_file(manifest_path='public/data/manifest.json'):
    print(f'\n[Manifest Audit] {manifest_path}')
    try:
        manifest = read_json(manifest_path)
    except (OSError, ValueError, TypeError) as exc:
        print(' [FAIL]', exc)
        return False
    if not isinstance(manifest, dict) or manifest.get('schema_version') != '1.1' or not isinstance(manifest.get('datasets'), list):
        print(' [FAIL] Invalid Schema v1.1 manifest')
        return False
    public = Path(manifest_path).resolve().parent.parent
    seen = set()
    ok = True
    for entry in manifest['datasets']:
        if not isinstance(entry, dict) or any(not nonempty(entry.get(k)) for k in ('id', 'path', 'label', 'comparison_group')):
            print(' [FAIL] Invalid manifest entry')
            ok = False
            continue
        if entry['id'] in seen:
            print(' [FAIL] Duplicate dataset ID:', entry['id'])
            ok = False
        seen.add(entry['id'])
        web_path = entry['path']
        target = (public / web_path.lstrip('/')).resolve()
        if not web_path.startswith('/') or not target.is_relative_to(public) or target.suffix.lower() != '.json':
            print(' [FAIL] Invalid dataset path:', web_path)
            ok = False
            continue
        if not validate_dataset_file(target):
            ok = False
    print(' [PASS] Manifest validated' if ok else ' [FAIL] Manifest validation failed')
    return ok


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Validate Earth Echo Schema v1.1 files')
    parser.add_argument('--file')
    parser.add_argument('--manifest', default='public/data/manifest.json')
    args = parser.parse_args()
    sys.exit(0 if (validate_dataset_file(args.file) if args.file else validate_manifest_file(args.manifest)) else 1)
