"""Compare synchronized full-view 3x3 flow and trajectory logs.

Empty detection frames are valid and marked TRACKING UNAVAILABLE.
Directional agreement is a diagnostic, not surge probability or accuracy.
"""

import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median


def compare(trajectories, flow, summary, output, start=3.0):
    meta = json.loads(
        Path(summary).read_text(encoding="utf-8-sig")
    )

    width, height = meta["width"], meta["height"]

    if (width, height) != (1280, 720):
        raise ValueError(
            "This comparison expects matching full-view 1280x720 inputs."
        )

    if not math.isfinite(start) or start < 0:
        raise ValueError("--start must be a finite, nonnegative time")

    fps = float(meta["source_fps"])
    processed = int(meta["frames_processed"])

    if not math.isfinite(fps) or fps <= 0 or processed <= 0:
        raise ValueError("Invalid source FPS or processed-frame count")

    frames = defaultdict(dict)
    times = {}

    with Path(trajectories).open(
        newline="", encoding="utf-8-sig"
    ) as handle:
        reader = csv.DictReader(handle)

        required = {
            "frame", "time_s", "track_id", "anchor_x", "anchor_y"
        }
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("Trajectory CSV is missing required columns")

        for row in reader:
            frame = int(row["frame"])
            track_id = row["track_id"]
            time_s = float(row["time_s"])
            x = float(row["anchor_x"])
            y = float(row["anchor_y"])

            if not all(math.isfinite(v) for v in (time_s, x, y)):
                raise ValueError("Nonfinite trajectory value")

            if track_id in frames[frame]:
                raise ValueError("Duplicate frame-track ID")

            if (
                frame in times
                and abs(times[frame] - time_s) > 1e-6
            ):
                raise ValueError("Inconsistent timestamp within a frame")

            times[frame] = time_s
            frames[frame][track_id] = (x, y)

    logs = [
        json.loads(line)
        for line in Path(flow).read_text(
            encoding="utf-8-sig"
        ).splitlines()
        if line.strip()
    ]

    if not logs:
        raise ValueError("Empty flow log")

    if len({row["frame"] for row in logs}) != len(logs):
        raise ValueError("Duplicate flow frames")

    # Check video timing without requiring detections in every frame.
    for row in logs:
        frame, time_s = row["frame"], row["time_s"]

        if (
            not isinstance(frame, int)
            or not 0 <= frame < processed
            or not math.isfinite(time_s)
            or abs(time_s - frame / fps) > 0.001
        ):
            raise ValueError(
                "Flow frame/time does not match the tracking run"
            )

    for frame, time_s in times.items():
        if (
            not 0 <= frame < processed
            or abs(time_s - frame / fps) > 0.001
        ):
            raise ValueError(
                "Trajectory frame/time does not match the tracking run"
            )

    logs.sort(key=lambda row: row["frame"])
    selected_logs = [
        row for row in logs if row["time_s"] >= start
    ]

    if not selected_logs:
        raise ValueError("No flow frames remain after --start")

    cell_order = [
        f"R{r}C{c}"
        for r in range(1, 4)
        for c in range(1, 4)
    ]

    def zone(x, y):
        if not (0 <= x < width and 0 <= y < height):
            return None

        column = min(2, int(3 * x / width))
        row = min(2, int(3 * y / height))
        return row * 3 + column

    pairs = []

    for row in selected_logs:
        frame = row["frame"]
        time_s = row["time_s"]

        if [cell["cell"] for cell in row["cells"]] != cell_order:
            raise ValueError("Unexpected flow grid or cell order")

        local_velocities = [[] for _ in range(9)]
        current_tracks = frames.get(frame, {})
        previous_tracks = frames.get(frame - 1, {})

        if previous_tracks:
            dt = time_s - times[frame - 1]

            if 0 < dt <= 0.5:
                for track_id, (x, y) in current_tracks.items():
                    if track_id not in previous_tracks:
                        continue

                    previous_x, previous_y = previous_tracks[track_id]
                    cell_index = zone(x, y)

                    # Only use consecutive observations in the same zone.
                    if (
                        cell_index is not None
                        and zone(previous_x, previous_y) == cell_index
                    ):
                        local_velocities[cell_index].append(
                            (
                                (x - previous_x) / dt,
                                (y - previous_y) / dt,
                            )
                        )

        for index, cell in enumerate(row["cells"]):
            velocities = local_velocities[index]

            if not current_tracks:
                tracking_state = "TRACKING UNAVAILABLE"
            elif len(velocities) < 3:
                tracking_state = "INSUFFICIENT TRACK SUPPORT"
            else:
                tracking_state = "TRACK MOTION AVAILABLE"

            pair = {
                "frame": frame,
                "time_s": time_s,
                "cell": cell["cell"],
                "flow_state": cell["state"],
                "flow_vx": cell["vx"],
                "flow_vy": cell["vy"],
                "flow_coherence": cell["coherence"],
                "tracking_state": tracking_state,
                "track_support": len(velocities),
                "track_vx": None,
                "track_vy": None,
                "cosine": None,
                "comparison": "UNAVAILABLE",
            }

            if len(velocities) >= 3:
                track_vx = median(vx for vx, vy in velocities)
                track_vy = median(vy for vx, vy in velocities)

                pair["track_vx"] = track_vx
                pair["track_vy"] = track_vy

                if cell["vx"] is not None and cell["vy"] is not None:
                    flow_speed = math.hypot(cell["vx"], cell["vy"])
                    track_speed = math.hypot(track_vx, track_vy)

                    if min(flow_speed, track_speed) >= 3:
                        cosine = (
                            track_vx * cell["vx"]
                            + track_vy * cell["vy"]
                        ) / (flow_speed * track_speed)

                        pair["cosine"] = max(-1.0, min(1.0, cosine))
                        pair["comparison"] = (
                            "AGREE"
                            if pair["cosine"] >= 0.5
                            else "DISAGREE"
                        )
                    else:
                        pair["comparison"] = "LOW NET MOTION"

            pairs.append(pair)

    comparable = [
        pair
        for pair in pairs
        if pair["flow_state"] == "COHERENT SCENE FLOW"
        and pair["comparison"] in ("AGREE", "DISAGREE")
    ]

    states = Counter(pair["flow_state"] for pair in pairs)
    measured = (
        states["COHERENT SCENE FLOW"]
        + states["MIXED SCENE MOTION"]
    )

    result = {
        "video_source": meta["source"],
        "time_start_s": start,
        "compared_frames": len(selected_logs),
        "paired_zone_observations": len(pairs),
        "frames_without_trajectory_rows": sum(
            not frames.get(row["frame"])
            for row in selected_logs
        ),
        "tracking_states": dict(
            Counter(pair["tracking_state"] for pair in pairs)
        ),
        "flow_states": dict(states),
        "mixed_fraction_of_measured": (
            states["MIXED SCENE MOTION"] / measured
            if measured else None
        ),
        "comparable_coherent_zone_observations": len(comparable),
        "agreement_fraction_of_comparable_coherent": (
            sum(
                pair["comparison"] == "AGREE"
                for pair in comparable
            ) / len(comparable)
            if comparable else None
        ),
        "per_zone": {},
        "one_second_net_vectors": [],
        "limitations": [
            "Inputs must represent the same full-view 1280x720 clip. "
            "Timing checks cannot verify source identity.",
            "Missing CSV rows mean tracking evidence is unavailable; "
            "they do not establish that the scene is empty.",
            "Available track motion does not establish adequate "
            "coverage of the actual crowd.",
            "Flow uses mean active-pixel velocity; tracks use median "
            "continuous-ID velocity. Magnitudes are different measures.",
            "Agreement requires cosine >= 0.5, at least three tracks, "
            "and both net speeds >= 3 px/s. Thresholds are provisional.",
            "Frames and zones are correlated. Agreement is not "
            "accuracy or surge probability.",
            "Mixed motion is retained and is not a surge label.",
            "Camera motion is not compensated. Verify that the "
            "visibility reference was established on a stable view.",
            "No model is trained and no SOP is activated by this script.",
        ],
    }

    for name in cell_order:
        subset = [
            pair for pair in comparable if pair["cell"] == name
        ]
        result["per_zone"][name] = {
            "comparable": len(subset),
            "agree": sum(
                pair["comparison"] == "AGREE"
                for pair in subset
            ),
        }

    vector_keys = (
        "track_vx", "track_vy", "flow_vx", "flow_vy"
    )

    first_second = math.floor(selected_logs[0]["time_s"])
    last_second = math.floor(selected_logs[-1]["time_s"])

    for second in range(first_second, last_second + 1):
        subset = [
            pair
            for pair in pairs
            if second <= pair["time_s"] < second + 1
            and all(pair[key] is not None for key in vector_keys)
        ]

        if subset:
            result["one_second_net_vectors"].append({
                "second": second,
                "zone_observations": len(subset),
                **{
                    key: mean(pair[key] for pair in subset)
                    for key in vector_keys
                },
            })

    output_path = Path(output)
    output_path.mkdir(parents=True, exist_ok=True)

    (output_path / "comparison_summary.json").write_text(
        json.dumps(result, indent=2, allow_nan=False),
        encoding="utf-8",
    )

    with (output_path / "paired_zone_motion.jsonl").open(
        "w", encoding="utf-8"
    ) as handle:
        for pair in pairs:
            handle.write(json.dumps(pair, allow_nan=False) + "\n")

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)

    for argument in ("trajectories", "flow", "summary", "output"):
        parser.add_argument("--" + argument, required=True)

    parser.add_argument("--start", type=float, default=3.0)
    args = parser.parse_args()

    result = compare(
        trajectories=args.trajectories,
        flow=args.flow,
        summary=args.summary,
        output=args.output,
        start=args.start,
    )

    print(json.dumps(result, indent=2, allow_nan=False))