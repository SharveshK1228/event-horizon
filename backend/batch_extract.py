"""Batch extraction only: no model training or automatic surge labels.
Place beside extract_tracks.py and extract_flow.py. Uses the active Python env.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

VIDEO_SUFFIXES = {'.mp4', '.avi', '.mov', '.mkv', '.m4v'}


def save(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, indent=2), encoding='utf-8')
    tmp.replace(path)


def fingerprint(path):
    stat = path.stat()
    return {'path': str(path), 'bytes': stat.st_size,
            'mtime_ns': stat.st_mtime_ns}


def completed(stage, directory):
    if stage == 'flow':
        candidates = [directory / 'summary.json']
        data_name, required = 'zone_flow.jsonl', 'complete'
    else:
        candidates = sorted(directory.glob('analytics_*/run_summary.json'))
        data_name, required = 'trajectories.csv', 'completed'
    for summary in reversed(candidates):
        try:
            meta = json.loads(summary.read_text(encoding='utf-8-sig'))
            data = summary.parent / data_name
            if meta.get('status') == required and data.is_file():
                return {'summary': str(summary), 'data': str(data)}
        except (OSError, ValueError):
            pass
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--output', default='outputs/batch_motion')
    parser.add_argument('--device', default='0')
    parser.add_argument('--imgsz', type=int, default=1280)
    parser.add_argument('--conf', type=float, default=.25)
    parser.add_argument('--flow-width', type=int, default=640)
    parser.add_argument('--limit', type=int, help='Process first N sorted videos')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    root = Path(args.dataset).resolve()
    output = Path(args.output).resolve()
    model = Path(args.model).resolve()
    scripts = {s: Path(__file__).resolve().parent / name for s, name in
               [('tracks', 'extract_tracks.py'), ('flow', 'extract_flow.py')]}
    if not root.is_dir():
        parser.error('Dataset directory does not exist')
    if output == root or root in output.parents:
        parser.error('Keep output outside the dataset directory')
    if args.limit is not None and args.limit < 1:
        parser.error('--limit must be positive')
    videos = sorted((p for p in root.rglob('*') if p.is_file() and
                     p.suffix.lower() in VIDEO_SUFFIXES), key=lambda p: str(p).lower())
    if args.limit:
        videos = videos[:args.limit]
    if not videos:
        parser.error('No supported videos found')
    for index, video in enumerate(videos, 1):
        print(f'{index}: {video.relative_to(root)}', flush=True)
    print(f'Videos selected: {len(videos)}', flush=True)
    if args.dry_run:
        return 0
    if not model.is_file() or any(not p.is_file() for p in scripts.values()):
        parser.error('Model or extraction scripts are missing')
    output.mkdir(parents=True, exist_ok=True)
    records = []
    failures = 0
    for index, video in enumerate(videos, 1):
        relative = video.relative_to(root).as_posix()
        # Top-level event folder is a conservative suggested split group.
        # Review this before training; same-event clips must stay together.
        signature = {'source': fingerprint(video), 'model': fingerprint(model),
                     'scripts': {s: hashlib.sha256(p.read_bytes()).hexdigest()
                                 for s, p in scripts.items()},
                     'device': args.device, 'imgsz': args.imgsz, 'conf': args.conf,
                     'flow_width': args.flow_width}
        key = hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest()[:16]
        directory = output / key
        directory.mkdir(exist_ok=True)
        state_path = directory / 'state.json'
        state = {'source_relative': relative,
                 'event_group_suggested': relative.split('/')[0] if '/' in relative else 'REVIEW_REQUIRED',
                 'split': 'UNASSIGNED', 'label': 'UNREVIEWED',
                 'signature': signature, 'stages': {}}
        if state_path.exists():
            state = json.loads(state_path.read_text(encoding='utf-8'))
        print(f'[{index}/{len(videos)}] {relative}', flush=True)
        for stage in ('tracks', 'flow'):
            previous = state['stages'].get(stage, {})
            found = completed(stage, Path(previous['directory'])) if previous.get('directory') else None
            if found:
                print(f'  {stage}: already complete', flush=True)
                previous.update(status='complete', **found)
                continue
            stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')
            attempt = directory / f'{stage}_{stamp}'
            log = directory / f'{stage}_{stamp}.log'
            command = [sys.executable, str(scripts[stage]), '--source', str(video),
                       '--output', str(attempt)]
            if stage == 'tracks':
                command += ['--model', str(model), '--target', 'head', '--imgsz', str(args.imgsz),
                            '--conf', str(args.conf), '--device', args.device]
            else:
                command += ['--width', str(args.flow_width)]
            state['stages'][stage] = {'status': 'running', 'directory': str(attempt),
                                      'log': str(log), 'command': command}
            save(state_path, state)
            print(f'  {stage}: processing; log: {log}', flush=True)
            with log.open('w', encoding='utf-8') as handle:
                run = subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT)
            found = completed(stage, attempt)
            success = run.returncode == 0 and found is not None
            state['stages'][stage].update(status='complete' if success else 'failed',
                                          returncode=run.returncode, **(found or {}))
            save(state_path, state)
            if not success:
                failures += 1
            print(f'  {stage}: {state["stages"][stage]["status"]}', flush=True)
        records.append(state)
        save(output / 'batch_manifest.json', {'dataset': str(root), 'runs': records,
             'note': 'Selected videos only. Review event groups, camera motion and quality before training.'})
    print(f'Finished. Failed stages: {failures}. Manifest: {output / "batch_manifest.json"}')
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
