"""Visibility-aware crowd overlay for the Event Horizon prototype.

This post-processes an existing trajectories.csv. It does not invent detections:
missing tracks are labelled ``predicted`` and expire after a short memory window.
The visibility score is a heuristic based on detected-track count and grayscale
contrast. Use it to trigger an operator alert, not as a safety certification.
"""

import argparse
import csv
import math
from collections import defaultdict, deque
from pathlib import Path


def load_rows(path):
    with Path(path).open(newline="", encoding="utf-8") as h:
        return list(csv.DictReader(h))


def nearest_edges(points, radius, max_neighbours):
    ids = list(points)
    out = set()
    r2 = radius * radius
    for a in ids:
        ax, ay = points[a]
        candidates = []
        for b in ids:
            if a == b:
                continue
            bx, by = points[b]
            d2 = (ax - bx) ** 2 + (ay - by) ** 2
            if d2 <= r2:
                candidates.append((d2, b))
        for _, b in sorted(candidates)[:max_neighbours]:
            out.add(tuple(sorted((a, b))))
    return sorted(out)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True)
    p.add_argument("--trajectories", required=True)
    p.add_argument("--output", default="outputs/smart_visibility_overlay.mp4")
    p.add_argument("--radius-px", type=float, default=100)
    p.add_argument("--max-neighbours", type=int, default=6)
    p.add_argument("--memory-seconds", type=float, default=1.0)
    p.add_argument("--visibility-ratio", type=float, default=.60)
    p.add_argument("--alert-frames", type=int, default=5)
    p.add_argument("--step", type=int, default=1)
    args = p.parse_args()
    if args.radius_px <= 0 or args.max_neighbours <= 0 or args.memory_seconds < 0 or not 0 < args.visibility_ratio <= 1 or args.alert_frames <= 0 or args.step <= 0:
        p.error("Invalid numeric option")
    import cv2
    import numpy as np

    rows = load_rows(args.trajectories)
    by_frame = defaultdict(dict)
    for r in rows:
        by_frame[int(r["frame"])][int(r["track_id"])] = r
    cap = cv2.VideoCapture(str(Path(args.source).resolve()))
    if not cap.isOpened():
        raise RuntimeError("Cannot open source video")
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not math.isfinite(fps) or fps <= 0:
        raise RuntimeError("Source video has no valid FPS")
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    output = Path(args.output).resolve(); output.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(output), cv2.VideoWriter_fourcc(*"mp4v"), fps / args.step, (width, height))
    if not writer.isOpened():
        cap.release(); raise RuntimeError("Cannot create output video")

    # Estimate a baseline from the first usable frames. This is a visibility
    # baseline, not a ground-truth population count.
    initial_counts = [len(by_frame[k]) for k in sorted(by_frame)[:30] if by_frame[k]]
    baseline = max(1.0, float(np.median(initial_counts))) if initial_counts else 1.0
    contrast_baseline = None
    contrast_history = deque(maxlen=30)
    memory = {}
    missing_limit = args.memory_seconds * fps
    alert_run = 0
    frame = 0; written = 0
    with (output.with_suffix(".visibility.csv")).open("w", newline="", encoding="utf-8") as h:
        log = csv.writer(h)
        log.writerow(["frame", "time_s", "observed_nodes", "remembered_nodes", "visibility_score", "state", "edges", "alert"])
        while True:
            ok, image = cap.read()
            if not ok:
                break
            if frame % args.step:
                frame += 1; continue
            current = by_frame.get(frame, {})
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            contrast = float(gray.std())
            contrast_history.append(contrast)
            if contrast_baseline is None and len(contrast_history) >= 5:
                contrast_baseline = max(1.0, float(np.median(contrast_history)))
            count_ratio = min(1.0, len(current) / baseline) if baseline else 0.0
            contrast_ratio = min(1.0, contrast / contrast_baseline) if contrast_baseline else 1.0
            visibility = min(count_ratio, contrast_ratio)
            if visibility < args.visibility_ratio:
                alert_run += 1
            else:
                alert_run = max(0, alert_run - 1)
            degraded = alert_run >= args.alert_frames
            state = "LOW_VISIBILITY" if degraded else "NORMAL"

            points = {}
            kinds = {}
            for tid, r in current.items():
                x, y = float(r["anchor_x"]), float(r["anchor_y"])
                previous = memory.get(tid)
                vx = vy = 0.0
                if previous and previous["frame"] < frame and frame - previous["frame"] <= 3:
                    dt = (frame - previous["frame"]) / fps
                    if dt > 0:
                        vx, vy = (x - previous["x"]) / dt, (y - previous["y"]) / dt
                memory[tid] = {"frame": frame, "x": x, "y": y, "vx": vx, "vy": vy}
                points[tid] = (x, y); kinds[tid] = "observed"
            if degraded:
                for tid, last in list(memory.items()):
                    gap = frame - last["frame"]
                    if tid not in current and 0 < gap <= missing_limit:
                        dt = gap / fps
                        points[tid] = (last["x"] + last["vx"] * dt, last["y"] + last["vy"] * dt)
                        kinds[tid] = "predicted"
                    elif gap > missing_limit:
                        del memory[tid]
            else:
                for tid, last in list(memory.items()):
                    if frame - last["frame"] > missing_limit:
                        del memory[tid]
            edges = nearest_edges(points, args.radius_px, args.max_neighbours)
            for a, b in edges:
                colour = (120, 120, 120) if kinds[a] == "predicted" or kinds[b] == "predicted" else (255, 180, 0)
                cv2.line(image, tuple(map(int, points[a])), tuple(map(int, points[b])), colour, 1, cv2.LINE_AA)
            for tid, (x, y) in points.items():
                colour = (0, 220, 255) if kinds[tid] == "predicted" else (0, 255, 0)
                cv2.circle(image, (int(x), int(y)), 4 if kinds[tid] == "observed" else 5, colour, -1, cv2.LINE_AA)
                if kinds[tid] == "predicted":
                    cv2.putText(image, "P", (int(x)+4, int(y)), cv2.FONT_HERSHEY_SIMPLEX, .35, colour, 1, cv2.LINE_AA)
            banner = (0, 0, 180) if degraded else (30, 90, 30)
            cv2.rectangle(image, (0, 0), (640, 66 if degraded else 40), banner, -1)
            cv2.putText(image, f"Observed: {len(current)} | Remembered: {sum(k == 'predicted' for k in kinds.values())} | Edges: {len(edges)} | Visibility: {visibility:.2f}", (8, 25), cv2.FONT_HERSHEY_SIMPLEX, .55, (255,255,255), 1, cv2.LINE_AA)
            if degraded:
                cv2.putText(image, "LOW VISIBILITY - SWITCH CAMERA / RESTORE VIEW", (8, 52), cv2.FONT_HERSHEY_SIMPLEX, .55, (255,255,255), 1, cv2.LINE_AA)
            writer.write(image)
            log.writerow([frame, round(frame / fps, 4), len(current), sum(k == "predicted" for k in kinds.values()), round(visibility, 4), state, len(edges), int(degraded)])
            written += 1; frame += 1
    cap.release(); writer.release()
    if not written:
        raise RuntimeError("No frames rendered")
    print(f"Rendered {written} frames to {output}")
    print(f"Visibility log: {output.with_suffix('.visibility.csv')}")


if __name__ == "__main__":
    main()
