"""Event Horizon Module 1: one recorded video -> trails, tracks CSV and metadata.

Run from the project folder: python track_people.py
Requires the existing ultralytics, opencv-python, lap and GPU PyTorch environment.
Coordinates are pixels in the original frame. Times are frame_index / source FPS
(constant-frame-rate approximation). IDs are video-local tracks, not identities.
BoT-SORT uses the installed package defaults; appearance ReID is not enabled here.
API reference: https://docs.ultralytics.com/modes/track/
"""

import argparse
import csv
import json
import math
from collections import deque
from datetime import datetime
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='data/videos/sample.mp4')
    parser.add_argument('--model', default='yolo26n.pt')
    parser.add_argument('--output', default='outputs')
    args = parser.parse_args()

    import cv2
    import numpy as np
    import torch
    import ultralytics
    from ultralytics import YOLO

    source = Path(args.source).resolve()
    if not source.is_file():
        raise FileNotFoundError(f'Video not found: {source}')
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable. Activate the verified .venv first.')

    cap = cv2.VideoCapture(str(source))
    writer = None
    frames = rows = 0
    run_dir = None
    state = 'failed'
    metadata = {}
    try:
        if not cap.isOpened():
            raise RuntimeError(f'OpenCV cannot open: {source}')
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        if not math.isfinite(fps) or fps <= 0:
            raise RuntimeError('Missing or invalid source FPS; cannot timestamp reliably.')
        reported_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError('Video opened but its first frame could not be decoded.')
        height, width = frame.shape[:2]
        model = YOLO(args.model)
        run_dir = Path(args.output).resolve() / datetime.now().strftime('tracking_%Y%m%d_%H%M%S_%f')
        run_dir.mkdir(parents=True, exist_ok=False)
        writer = cv2.VideoWriter(str(run_dir / 'tracked_video.mp4'),
                                 cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
        if not writer.isOpened():
            raise RuntimeError('OpenCV could not create the MP4 output.')
        metadata = {
            'source': str(source), 'model': args.model, 'tracker': 'botsort.yaml',
            'ultralytics': ultralytics.__version__, 'torch': torch.__version__,
            'opencv': cv2.__version__, 'gpu': torch.cuda.get_device_name(0),
            'fps': fps, 'width_px': width, 'height_px': height,
            'reported_frame_count': reported_frames, 'confidence_threshold': 0.25,
            'imgsz': 640, 'time_basis': 'zero-based frame_index / FPS; CFR approximation',
            'coordinates': 'original image pixels, origin top-left',
            'track_semantics': 'video-local IDs; ID switches and fragmentation are possible',
            'trail_semantics': 'last 40 observations; trail resets after a missing frame',
        }
        trails = {}
        with (run_dir / 'trajectories.csv').open('w', newline='', encoding='utf-8') as handle:
            log = csv.writer(handle)
            log.writerow(['frame_index', 'time_s', 'track_id', 'confidence',
                          'x1_px', 'y1_px', 'x2_px', 'y2_px',
                          'center_x_px', 'center_y_px', 'foot_x_px', 'foot_y_px'])
            while ok:
                if frame.shape[:2] != (height, width):
                    raise RuntimeError('Frame dimensions changed within the video.')
                result = model.track(frame, persist=True, tracker='botsort.yaml',
                                     classes=[0], device=0, imgsz=640,
                                     conf=0.25, verbose=False)[0]
                annotated = result.plot()
                current = set()
                boxes = result.boxes
                if boxes is not None and boxes.id is not None:
                    ids = boxes.id.int().cpu().tolist()
                    coords = boxes.xyxy.cpu().tolist()
                    scores = boxes.conf.cpu().tolist()
                    for track_id, (x1, y1, x2, y2), confidence in zip(ids, coords, scores):
                        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                        current.add(track_id)
                        history = trails.setdefault(track_id, deque(maxlen=40))
                        history.append((round(cx), round(y2)))
                        color = ((track_id * 37) % 180 + 60,
                                 (track_id * 67) % 180 + 60,
                                 (track_id * 97) % 180 + 60)
                        if len(history) > 1:
                            points = np.array(history, dtype=np.int32).reshape(-1, 1, 2)
                            cv2.polylines(annotated, [points], False, color, 2)
                        log.writerow([frames, round(frames / fps, 6), track_id,
                                      round(confidence, 6), x1, y1, x2, y2, cx, cy, cx, y2])
                        rows += 1
                # Avoid drawing a continuous path through an unobserved gap.
                for missing_id in set(trails) - current:
                    del trails[missing_id]
                writer.write(annotated)
                frames += 1
                if frames % 50 == 0:
                    print(f'Processed {frames} frames; saved {rows} track observations.')
                ok, frame = cap.read()
        if reported_frames > 0 and frames < reported_frames:
            state = 'incomplete'
            raise RuntimeError(f'Decoding stopped at {frames}/{reported_frames} frames. Output is partial.')
        state = 'completed'
    finally:
        cap.release()
        if writer is not None:
            writer.release()
        if run_dir is not None:
            metadata.update(status=state, frames_processed=frames, trajectory_rows=rows)
            (run_dir / 'run_summary.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')

    # Verify saved video can be opened and its first frame decoded.
    check = cv2.VideoCapture(str(run_dir / 'tracked_video.mp4'))
    try:
        readable, _ = check.read()
    finally:
        check.release()
    if not readable:
        raise RuntimeError(f'Saved video could not be reopened: {run_dir}')
    print(f'Finished: {frames} frames, {rows} trajectory rows.\nOutputs: {run_dir}')
    if rows == 0:
        print('No track observations were recorded. Inspect the video and detections.')


if __name__ == '__main__':
    main()
