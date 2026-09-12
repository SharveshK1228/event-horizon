"""Event Horizon prototype: turn tracked observations into a dynamic crowd network.

This is a hackathon prototype. Without camera calibration, ``radius_px`` is an
image-space proxy for the intended 5-metre neighbourhood radius. It must not be
reported as a physical distance until a ground-plane calibration is supplied.

Input: trajectories.csv produced by track_people.py.
Output: node_metrics.csv, network_metrics.csv, graph_edges.csv, and summary.json.
"""

import argparse
import csv
import json
import math
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path


def read_rows(path):
    with Path(path).open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            yield {
                "frame": int(row["frame"]),
                "time_s": float(row["time_s"]),
                "track_id": int(row["track_id"]),
                "x": float(row["anchor_x"]),
                "y": float(row["anchor_y"]),
            }


def direction(dx, dy):
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return "stationary"
    return "right" if abs(dx) >= abs(dy) and dx > 0 else (
        "left" if abs(dx) >= abs(dy) else ("down" if dy > 0 else "up")
    )


def components(nodes, edges):
    graph = defaultdict(set)
    for a, b in edges:
        graph[a].add(b)
        graph[b].add(a)
    seen = set()
    sizes = []
    for node in nodes:
        if node in seen:
            continue
        q = deque([node])
        seen.add(node)
        size = 0
        while q:
            cur = q.popleft()
            size += 1
            for nxt in graph[cur]:
                if nxt not in seen:
                    seen.add(nxt)
                    q.append(nxt)
        sizes.append(size)
    return sorted(sizes, reverse=True)


def graph_for(points, radius):
    ids = list(points)
    edges = []
    radius2 = radius * radius
    for i, a in enumerate(ids):
        ax, ay = points[a]
        for b in ids[i + 1 :]:
            bx, by = points[b]
            if (ax - bx) ** 2 + (ay - by) ** 2 <= radius2:
                edges.append((a, b))
    degrees = defaultdict(int)
    for a, b in edges:
        degrees[a] += 1
        degrees[b] += 1
    return edges, degrees


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trajectories", help="Path to trajectories.csv")
    parser.add_argument("--radius-px", type=float, default=100.0,
                        help="Image-space neighbourhood radius; calibrate later")
    parser.add_argument("--horizons", default="1,2,3",
                        help="Forecast horizons in seconds")
    parser.add_argument("--output", default="outputs/network_analysis")
    args = parser.parse_args()
    if args.radius_px <= 0:
        parser.error("--radius-px must be positive")
    horizons = [float(v) for v in args.horizons.split(",") if v.strip()]
    if not horizons or any(v <= 0 for v in horizons):
        parser.error("--horizons must contain positive seconds")

    rows = list(read_rows(args.trajectories))
    if not rows:
        raise ValueError("No trajectory observations found")
    by_frame = defaultdict(list)
    for row in rows:
        by_frame[row["frame"]].append(row)
    frames = sorted(by_frame)
    output = Path(args.output).resolve() / datetime.now().strftime("network_%Y%m%d_%H%M%S_%f")
    output.mkdir(parents=True, exist_ok=False)

    previous = {}
    node_rows = []
    network_rows = []
    edge_rows = []
    forecast_rows = []
    for frame in frames:
        observations = {r["track_id"]: r for r in by_frame[frame]}
        points = {tid: (r["x"], r["y"]) for tid, r in observations.items()}
        velocities = {}
        for tid, r in observations.items():
            prior = previous.get(tid)
            dt = r["time_s"] - prior["time_s"] if prior else 0
            velocities[tid] = ((r["x"] - prior["x"]) / dt,
                               (r["y"] - prior["y"]) / dt) if prior and dt > 0 else (0.0, 0.0)
        edges, degrees = graph_for(points, args.radius_px)
        for a, b in edges:
            edge_rows.append([frame, observations[a]["time_s"], a, b, args.radius_px])
        sizes = components(points, edges)
        largest = sizes[0] if sizes else 0
        for tid, r in observations.items():
            vx, vy = velocities[tid]
            speed = math.hypot(vx, vy)
            node_rows.append([frame, r["time_s"], tid, r["x"], r["y"], degrees[tid], speed, direction(vx, vy)])
            for horizon in horizons:
                forecast_rows.append([frame, r["time_s"], tid, horizon,
                                      r["x"] + vx * horizon, r["y"] + vy * horizon])
        network_rows.append([frame, observations[ next(iter(observations)) ]["time_s"],
                             len(points), len(edges),
                             sum(degrees.values()) / len(points) if points else 0,
                             largest, len(sizes)])
        previous = observations

    with (output / "node_metrics.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["frame", "time_s", "track_id", "x_px", "y_px", "neighbour_count", "speed_px_s", "direction"]); w.writerows(node_rows)
    with (output / "network_metrics.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["frame", "time_s", "detected_nodes", "edges", "mean_neighbour_count", "largest_component", "components"]); w.writerows(network_rows)
    with (output / "graph_edges.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["frame", "time_s", "track_id_a", "track_id_b", "radius_px"]); w.writerows(edge_rows)
    with (output / "forecasts.csv").open("w", newline="", encoding="utf-8") as h:
        w = csv.writer(h); w.writerow(["source_frame", "source_time_s", "track_id", "horizon_s", "predicted_x_px", "predicted_y_px"]); w.writerows(forecast_rows)
    summary = {
        "input": str(Path(args.trajectories).resolve()), "frames": len(frames),
        "first_frame": frames[0], "last_frame": frames[-1],
        "radius_px": args.radius_px, "intended_radius_m": 5,
        "radius_status": "image-space proxy; physical metres require camera calibration",
        "forecast_horizons_s": horizons,
        "node_semantics": "detected video-local tracks, not verified unique people",
        "forecast_model": "constant velocity from the previous observation",
        "status": "prototype metrics generated; accuracy and physical calibration unverified",
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Generated network prototype for {len(frames)} frames: {output}")
    print(f"Edges: {len(edge_rows)}; node rows: {len(node_rows)}; forecast rows: {len(forecast_rows)}")


if __name__ == "__main__":
    main()
