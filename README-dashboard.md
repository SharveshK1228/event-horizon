# Event Horizon dashboard addition

This version also includes the concentration forecast integration. Start with
README-forecast.md for the updated run commands, interpretation and validation plan.

This additive prototype uses your existing local head checkpoint. It does not replace
track_people.py, crowd_network.py, visualize_network.py or your existing dashboard.py.
Extract the ZIP contents directly into D:\event_horizon so dashboard_live.py sits beside track_people.py.

## Run on Windows

Open PowerShell in the project folder:

```powershell
cd D:\event_horizon
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dashboard.txt
python -m unittest test_crowd_signals.py -v
python -m streamlit run dashboard_live.py
```

Keep your existing working CUDA PyTorch, Ultralytics, OpenCV, NumPy and lap installation.
The additional requirements install only the dashboard packages. This is an overlay
for the existing environment, not a complete clean-machine dependency lockfile.

Open the localhost address shown in the terminal. Choose **Local video**, point to your
clip, and use your head-trained checkpoint (default outputs/training/head_trial/weights/best.pt).
Select **head** only if checkpoint class 0 is named head. The app validates this.
Use **person** for a person model. Start with GPU 0 and input size 1280 to match the
earlier analysis settings. If CUDA memory runs out, stop and retry 960 or 640.

The ROI sliders select a rectangular region; coordinates start at the top-left.
The displayed video is the selected crop. For the first test leave the full frame
selected, then select a stable region and restart. The first three source seconds
(at least ten frames) form a relative image-quality reference. Start with a clear view.

## What is implemented

- Local video, upload, local webcam and RTSP input paths. Webcam refers to the machine
  running Streamlit. RTSP uses OpenCV/FFmpeg timeouts when that backend is available.
- Per-session background processing with Start/Stop, a latest-frame display and a bounded history.
  Browser display updates every 0.4 seconds; inference runs independently. No fixed FPS guarantee.
- BoT-SORT tracking via the existing Ultralytics installation. The current count is
  the number of boxes returned by the tracking API; it may omit unconfirmed detections.
- Track velocity uses continuous IDs and source timestamps. Scene motion uses Farneback
  optical flow. Both are image pixels/second. They are not two independent people counters.
- A 3x3 tile contrast, sharpness and exposure check against the initial reference.
  The warning sensitivity is adjustable and has not been calibrated for spray or smoke.
- Up to two seconds of last reliable positions, shown as grey circles. Degraded frames
  cannot refresh this memory. Remembered positions expire and are excluded from current counts.
- Provisional motion agreement, disagreement, count-threshold and visibility messages.
  No state is labelled safe. Visibility degradation overrides the crowd inference.
- Observation CSV and run summary under outputs/dashboard_runs. Use the download button
  after Stop or end-of-file. Model/source URLs are excluded from the summary.

## Limits and validation

The package's pure-Python tests cover memory expiry, degraded-view gating, velocity gaps,
opposed motion, missing signals and local tile quality loss/recovery. Syntax checks cover all modules.
The build environment lacked OpenCV, Ultralytics and Streamlit. Full UI, model inference,
GPU performance, webcam and RTSP tests therefore still need to run on your machine.

Test the same clip and checkpoint as the existing tracker. Check a clear interval,
spray/obstruction onset, recovery and Stop/Restart. Inspect whether warnings occur early
enough; visual quality heuristics can miss textured obstructions and generate false alarms.
Confirm that remembered points expire and never increase the visible-count metric.

Optical flow responds to water, background and camera motion. Opposing directions can
cancel in aggregate. A reference-like view and agreeing directions do not establish
safe conditions, accurate counts or reliable identity continuity. There is no density-model
count estimate, identity recovery, camera switching or calibrated
physical crowd-risk prediction in this addition. The previous network scripts remain separate.
The added cell projection is an image-space constant-velocity baseline (see README-forecast.md).

File timestamps assume constant frame rate. Live timestamps describe processed capture
observations; camera buffering and dropped frames are unmeasured. Processing time displayed
excludes browser delivery. Stop is cooperative after the current inference/read. Closing
the browser expires the worker after about 45 seconds, subject to a blocking capture call.
For large clips use Local video instead of Upload video. Uploaded temporary files are
removed on the next run/reset; a process crash may leave one in the OS temporary folder.

## Commit the source after your local test

```powershell
git add dashboard_live.py dashboard_worker.py crowd_signals.py test_crowd_signals.py requirements-dashboard.txt README-dashboard.md
git --no-pager diff --cached --stat
git commit -m "Add video dashboard with motion comparison and visibility checks"
git push
```

Keep outputs/dashboard_runs and model files outside Git. This source package has not
been pushed by the assistant; it must be copied into your checkout and tested first.

API references: [Streamlit fragments](https://docs.streamlit.io/develop/api-reference/execution-flow/st.fragment)
and [Ultralytics tracking](https://docs.ultralytics.com/modes/track/).
