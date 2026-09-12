"""Convert a local SCUT-HEAD VOC download into a documented YOLO subset.

Run: python prepare_scut_head.py
Source files are never modified. Missing XML samples are excluded and reported.
Existing train/val/test membership is retained. trainval is checked, not added.
Output format: https://docs.ultralytics.com/datasets/detect/
Dataset: https://github.com/HCIILAB/SCUT-HEAD-Dataset-Release
"""
import argparse
import csv
import json
import math
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageDraw


def indexed(folder, suffixes):
    result = {}
    for p in sorted(folder.iterdir()):
        if p.is_file() and p.suffix.lower() in suffixes:
            key = p.stem.lower()
            if key in result:
                raise ValueError(f'Duplicate image/annotation stem: {p.stem}')
            result[key] = p
    return result


def read_split(path):
    ids = []
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if not line.strip():
            continue
        fields = line.split()
        if len(fields) != 1 or Path(fields[0]).name != fields[0]:
            raise ValueError(f'Unexpected split entry in {path}: {line}')
        ids.append(fields[0].lower())
    if len(ids) != len(set(ids)):
        raise ValueError(f'Duplicate IDs in {path}')
    return ids


def convert_box(coords, width, height, origin):
    x1, y1, x2, y2 = coords
    if not all(math.isfinite(v) for v in coords):
        raise ValueError('Non-finite box coordinate')
    if origin == 'voc1':
        x1 -= 1
        y1 -= 1
    original = (x1, y1, x2, y2)
    x1, y1 = max(0, min(width, x1)), max(0, min(height, y1))
    x2, y2 = max(0, min(width, x2)), max(0, min(height, y2))
    if x2 <= x1 or y2 <= y1:
        raise ValueError(f'Degenerate box: {coords}')
    label = (0, (x1+x2)/(2*width), (y1+y2)/(2*height),
             (x2-x1)/width, (y2-y1)/height)
    return label, (x1, y1, x2, y2), original != (x1, y1, x2, y2)


def check_xml_size(root, actual_size, key, warnings):
    """Fill absent/zero metadata from decoded pixels; reject contradictory sizes."""
    raw = tuple(root.findtext(f'size/{axis}') for axis in ('width', 'height'))
    xml_size = tuple(0 if value is None or not value.strip() else int(value)
                     for value in raw)
    for declared, actual in zip(xml_size, actual_size):
        if declared < 0 or (declared > 0 and declared != actual):
            raise ValueError(f'XML/image dimension mismatch: {xml_size} vs {actual_size}')
    if 0 in xml_size:
        warnings.append({'id': key, 'warning': 'missing_XML_dimensions_using_image_size',
                         'xml_size': xml_size, 'image_size': actual_size})


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', default='data/SCUT_HEAD')
    p.add_argument('--output', default='data/SCUT_HEAD_YOLO')
    p.add_argument('--box-origin', choices=['voc1', 'zero'], default='voc1',
                   help='Default assumes VOC 1-based inclusive boxes; verify previews.')
    args = p.parse_args()
    source, output = Path(args.source).resolve(), Path(args.output).resolve()
    if output.exists():
        raise FileExistsError(f'Output already exists: {output}. Choose a fresh --output path.')
    images = indexed(source / 'JPEGImages', {'.jpg', '.jpeg', '.png'})
    xmls = indexed(source / 'Annotations', {'.xml'})
    splits = {s: read_split(source / 'ImageSets' / 'Main' / f'{s}.txt')
              for s in ('train', 'val', 'test')}
    for a, b in [('train', 'val'), ('train', 'test'), ('val', 'test')]:
        overlap = set(splits[a]) & set(splits[b])
        if overlap:
            raise ValueError(f'{a}/{b} split overlap: {sorted(overlap)[:10]}')
    trainval = source / 'ImageSets' / 'Main' / 'trainval.txt'
    if trainval.exists() and set(read_split(trainval)) != set(splits['train']) | set(splits['val']):
        raise ValueError('trainval does not equal the union of train and val')

    records, excluded, warnings = [], [], []
    totals = {s: {'listed': len(ids), 'included': 0, 'excluded': 0, 'heads': 0}
              for s, ids in splits.items()}
    for split, ids in splits.items():
        for key in ids:
            if key not in images or key not in xmls:
                reason = 'missing_image' if key not in images else 'missing_xml'
                excluded.append({'split': split, 'id': key, 'reason': reason})
                totals[split]['excluded'] += 1
                continue
            image_path, xml_path = images[key], xmls[key]
            try:
                root = ET.parse(xml_path).getroot()
                with Image.open(image_path) as im:
                    im.load()
                    width, height = im.size
                    if im.getexif().get(274, 1) != 1:
                        raise ValueError('EXIF rotation needs review')
                check_xml_size(root, (width, height), key, warnings)
                objects = root.findall('object')
                if not objects:
                    raise ValueError('Empty annotation needs review; not assumed negative')
                labels, boxes = [], []
                for obj in objects:
                    name = obj.findtext('name', '').strip().lower()
                    if name not in {'head', 'person'}:
                        raise ValueError(f'Unexpected class: {name}')
                    coords = tuple(float(obj.findtext(f'bndbox/{k}')) for k in ('xmin','ymin','xmax','ymax'))
                    label, box, clipped = convert_box(coords, width, height, args.box_origin)
                    labels.append(label)
                    boxes.append(box)
                    if clipped:
                        warnings.append({'id': key, 'warning': 'box_clipped_to_image', 'source_box': coords})
                    if obj.findtext('difficult', '0').strip() == '1':
                        warnings.append({'id': key, 'warning': 'difficult_head_retained_as_positive'})
                # Join by dataset basename: historical XML filename/path fields can be stale.
                if Path(root.findtext('filename', '')).stem.lower() != key:
                    warnings.append({'id': key, 'warning': 'stale_XML_filename_ignored'})
                records.append((split, key, image_path, labels, boxes))
                totals[split]['included'] += 1
                totals[split]['heads'] += len(labels)
            except Exception as exc:
                raise ValueError(f'Annotation/image requires review: {key}: {exc}') from exc
    if any(v['included'] == 0 for v in totals.values()):
        raise ValueError('One or more splits have no usable labelled samples')

    output.mkdir(parents=True)
    for split in splits:
        (output / 'images' / split).mkdir(parents=True)
        (output / 'labels' / split).mkdir(parents=True)
    (output / 'previews').mkdir()
    preview_count = 0
    for split, key, image_path, labels, boxes in records:
        dest = output / 'images' / split / image_path.name
        shutil.copy2(image_path, dest)
        text = '\n'.join('0 ' + ' '.join(f'{v:.8f}' for v in row[1:]) for row in labels) + '\n'
        (output / 'labels' / split / f'{image_path.stem}.txt').write_text(text, encoding='utf-8')
        if split == 'train' and preview_count < 5:
            with Image.open(image_path) as im:
                preview = im.convert('RGB')
                draw = ImageDraw.Draw(preview)
                for box in boxes:
                    draw.rectangle(box, outline='lime', width=2)
                preview.save(output / 'previews' / f'{image_path.stem}.jpg')
            preview_count += 1
    with (output / 'excluded_samples.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['split', 'id', 'reason'])
        writer.writeheader()
        writer.writerows(excluded)
    report = {'source': str(source), 'splits': totals, 'coordinate_convention': args.box_origin,
              'class_mapping': {'person': 'head', 'head': 'head'},
              'subset_not_full_official_benchmark': bool(excluded),
              'excluded_samples': excluded, 'warnings': warnings,
              'visual_head_box_review': 'pending',
              'note': 'Exact-ID split overlaps checked; near-duplicate scenes are not checked.'}
    (output / 'conversion_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    yaml = ('# SCUT-HEAD subset; see conversion_report.json for exclusions\n'
            f'path: {json.dumps(output.as_posix())}\n'
            'train: images/train\nval: images/val\ntest: images/test\nnames:\n  0: head\n')
    (output / 'dataset.yaml').write_text(yaml, encoding='utf-8')
    print('Conversion complete. Original dataset unchanged.')
    for split, values in totals.items():
        print(f'{split}: {values["included"]} included, {values["excluded"]} excluded, {values["heads"]} head boxes')
    print(f'Output: {output}\nReview the five training previews before training.')
    print('Excluded test samples mean evaluation is on a subset, not the full official test set.')


if __name__ == '__main__':
    main()
