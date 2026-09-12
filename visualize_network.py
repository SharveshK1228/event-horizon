"""Render a visual crowd-network overlay from existing CSV outputs."""

import argparse
import csv
from collections import defaultdict
from pathlib import Path


def load_csv(path):
    with Path(path).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True, help="Original video")
    p.add_argument("--trajectories", required=True)
    p.add_argument("--edges", required=True, help="graph_edges.csv")
    p.add_argument("--forecasts", required=True, help="forecasts.csv")
    p.add_argument("--horizon", type=float, default=1.0)
    p.add_argument("--step", type=int, default=1, help="Render every Nth frame")
    p.add_argument("--output", default="outputs/network_overlay.mp4")
    args = p.parse_args()
    if args.horizon <= 0 or args.step <= 0:
        p.error("--horizon and --step must be positive")
    import cv2

    trajectories = load_csv(args.trajectories)
    edges = load_csv(args.edges)
    forecasts = load_csv(args.forecasts)
    by_frame = defaultdict(dict)
    for row in trajectories:
        by_frame[int(row["frame"])][int(row["track_id"])] = row
    edges_by_frame = defaultdict(list)
    for row in edges:
        edges_by_frame[int(row["frame"])].append((int(row["track_id_a"]), int(row["track_id_b"])))
    forecasts_by_frame = defaultdict(dict)
    for row in forecasts:
        if abs(float(row["horizon_s"]) - args.horizon) < 1e-6:
            forecasts_by_frame[int(row["source_frame"])][int(row["track_id"])] = row

    cap = cv2.VideoCapture(str(Path(args.source).resolve()))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open source video: {args.source}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*"mp4v"), fps / args.step, (width, height))
    if not writer.isOpened():
        cap.release(); raise RuntimeError(f"Cannot create output: {out}")
    frame = 0; written = 0
    while True:
        ok, image = cap.read()
        if not ok:
            break
        if frame % args.step:
            frame += 1; continue
        current = by_frame.get(frame, {})
        # Draw graph edges first so nodes remain visible.
        for a, b in edges_by_frame.get(frame, []):
            if a in current and b in current:
                ax, ay = int(float(current[a]["anchor_x"])), int(float(current[a]["anchor_y"]))
                bx, by = int(float(current[b]["anchor_x"])), int(float(current[b]["anchor_y"]))
                cv2.line(image, (ax, ay), (bx, by), (255, 180, 0), 1, cv2.LINE_AA)
        for tid, row in current.items():
            x, y = int(float(row["anchor_x"])), int(float(row["anchor_y"]))
            cv2.circle(image, (x, y), 3, (0, 255, 0), -1, cv2.LINE_AA)
            cv2.putText(image, str(tid), (x + 3, y - 3), cv2.FONT_HERSHEY_SIMPLEX, .32, (255, 255, 255), 1, cv2.LINE_AA)
        # Forecast markers use a cross and a short line from the current node.
        for tid, row in forecasts_by_frame.get(frame, {}).items():
            if tid not in current:
                continue
            x, y = int(float(current[tid]["anchor_x"])), int(float(current[tid]["anchor_y"]))
            px, py = int(float(row["predicted_x_px"])), int(float(row["predicted_y_px"]))
            cv2.line(image, (x, y), (px, py), (0, 220, 255), 1, cv2.LINE_AA)
            cv2.drawMarker(image, (px, py), (0, 220, 255), cv2.MARKER_CROSS, 8, 1, cv2.LINE_AA)
        cv2.rectangle(image, (0, 0), (430, 38), (0, 0, 0), -1)
        cv2.putText(image, f"Nodes: {len(current)} | Edges: {len(edges_by_frame.get(frame, []))} | Forecast: +{args.horizon:g}s", (8, 25), cv2.FONT_HERSHEY_SIMPLEX, .55, (255, 255, 255), 1, cv2.LINE_AA)
        writer.write(image); written += 1; frame += 1
    cap.release(); writer.release()
    if not written:
        raise RuntimeError("No frames were rendered")
    print(f"Rendered {written} frames to {out}")


if __name__ == "__main__":
    main()
