# Event Horizon concentration forecast integration

Extract all files directly into D:\event_horizon, beside track_people.py. This updates the dashboard files from the previous ZIP; it does not change your older tracking and network scripts or model weights.

```powershell
cd D:\event_horizon
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dashboard.txt
python -m unittest test_crowd_signals test_crowd_forecast
python -m streamlit run dashboard_live.py
```

Select your existing head_trial/weights/best.pt checkpoint and a video or camera. Choose a stable region with clear visibility; allow three seconds for the image reference and additional continuous track history. The dashboard adds a 3 by 3 grid and projections at +1, +2 and +3 seconds. Its threshold is configurable in the sidebar. Rows run top to bottom and columns left to right within the cropped region.

## What the model does

For each current track, fit a velocity over up to one second of recent positions. Require three observations spanning at least 0.3 seconds, no intervening gaps above 0.5 seconds, at least three eligible tracks, and coverage of at least 60% of current detector/tracker boxes. Extrapolate those tracks and count the projected positions in each cell. Counts beyond the selected region are removed. This is a constant-velocity baseline, not a trained congestion classifier. The concentration flag means the selected illustrative count threshold is exceeded; it is not a probability of a dangerous event.

Current and projected counts use the same eligible subset for comparable changes. Slow fractions use observed speeds, not a prediction that people will slow down. Track coverage is not detection accuracy. Ghost positions are never used. Visibility degradation and disagreement between net optical-flow and track-motion signals suspend forecasts and reset history. The quality heuristic can miss occlusions; lack of disagreement is not independent confirmation. Forecasts can run on continuous stationary tracks even when optical flow is unavailable.

## Interpretation and smoother movement

The system highlights concentration for operator review: inspect the bottleneck, check entry rates and inspect alternative routes. It does not control gates, recommend a verified safe route, or infer forces/pressure. Camera perspective, missed heads, ID switches, spray and unexpected turns can invalidate projections. Equal image cells have unequal physical areas. No people-per-square-metre or five-metre claim is made. Displayed population is visible detections, not the total on site.

## Outputs and validation

Each run writes signals.csv, concentration_forecasts.csv and summary.json under outputs/dashboard_runs. Unavailable projections produce a status row with empty cell fields. Ended or stale sessions suspend the live forecast view; download logs to inspect historical projections. The forecast is relative to the processed observation, not guaranteed current camera time: capture buffering and processing latency still need measurement.

Pure-Python synthetic tests cover convergence, uniform flow, exits, coverage loss, visibility resets, missing IDs, gaps and conflicting signals. GPU/video processing and dashboard rendering have not been executed in the build environment.

Before claiming improved accuracy, annotate held-out clips from the intended camera, separated by event/video from training. Measure head precision/recall and per-frame count error; compare projected versus annotated future cell counts at each horizon, and measure false alerts and missed annotated congestion events. Measure capture-to-display latency and sustained FPS on the target laptop. A later trained temporal model should use labelled cell occupancy, speed, inflow/outflow and visibility histories and beat this baseline on held-out events. No training was performed in this upgrade.

To commit the upgrade after testing locally:

```powershell
git add dashboard_live.py dashboard_worker.py crowd_signals.py crowd_forecast.py test_crowd_signals.py test_crowd_forecast.py requirements-dashboard.txt README-dashboard.md README-forecast.md
git commit -m "Add dashboard crowd concentration forecast baseline"
git push origin main
```
