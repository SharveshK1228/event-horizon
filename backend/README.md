# Event Horizon backend v0.1

Command-line backend for dataset inspection, trajectory training preparation, event labelling, a Random Forest forecast baseline and independent local optical flow. No dashboard or TensorFlow required.

## Install and first step

Extract the ZIP into D:\event_horizon\backend. The folder should contain backend.py directly. Use the existing activated .venv:

```powershell
cd D:\event_horizon
python -m pip install -r .\backend\requirements-backend.txt
python .\backend\backend.py scan --root "D:\PATH_TO_YOUR_DATASET" --output .\outputs\dataset_inventory.json
```

Replace the dataset path with the actual downloaded dataset folder. Send dataset_inventory.json for sequence review. The scan lists candidate image folders, videos and annotation files; it does not assume frames are ordered, know their FPS, or label events. The full Kaggle dataset was not available during this build.

Already included: data/recording_b/features.jsonl, audit.json and labels_to_review.json prepared from your uploaded 147,923-row trajectory file. It provides nine overlapping 3-second-history / 2-second-future candidates, all unlabelled. This is a workflow sample, not sufficient training evidence.

## Extract observations

Retain your working CUDA PyTorch, OpenCV and Ultralytics installation. This package does not bundle model weights, videos or datasets.

### Existing detector and tracker on a recorded video

```powershell
python .\backend\extract_tracks.py `
  --source .\data\videos\sample.mp4 `
  --model .\outputs\training\head_trial\weights\best.pt `
  --target head --imgsz 1280 --conf 0.25 --device 0 `
  --output .\outputs
```

extract_tracks.py is the existing recorded-video tracking implementation included for convenience, not a newly validated detector. It writes trajectories to a timestamped analytics folder. Inspect track stability before using those observations in training.

### Alternative optical flow (no detector checkpoint required)

```powershell
python .\backend\extract_flow.py `
  --source .\data\videos\sample.mp4 `
  --output .\outputs\flow_sample_01 --overlay
```

Outputs: zone_flow.jsonl, summary.json and optional flow_overlay.mp4. Use a new output folder for each run. This is recorded-file processing, not a live-camera service. The first three seconds establish a relative image-quality reference and must be clear and representative.

For a verified ordered image sequence, pass its folder with --fps and --confirm-order. FPS means the effective extracted-frame rate, not necessarily the original video's FPS. Do not guess it. Natural filename ordering is only a convenience; confirm missing frames, mixed clips and variable sampling yourself. No tracking-from-image-folder adapter is included yet. Video time currently assumes constant frame intervals.

Cyan paths are virtual probes projected through the current local scene-velocity field for up to two seconds. They are not tracked people. A mixed zone suppresses projection; a flagged degraded zone or direction disagreement stops a path. Coherence is direction consistency, not accuracy. Spray and camera movement can still look coherent. Automatic camera-motion compensation and reliable occlusion detection remain pending.

## Prepare trajectory training features

```powershell
python .\backend\backend.py prepare `
  --trajectories .\outputs\analytics_20260912_022505_771485\trajectories.csv `
  --video-id recording_b --output .\outputs\training_data\recording_b
```

Creates features.jsonl, audit.json and labels_to_review.json. Repeat separately for each recording with a unique ID. Existing labels are preserved on rerun. The initial classifier uses Full view only; zone-level classifier training is a later extension. Optical flow has nine zones, but those outputs are not yet aligned/joined into classifier training features.

Features: current visible-track count and trend, mean frame-median speed, slow fraction, motion-direction coherence and consecutive-track continuity. Pixel speeds are camera-specific. Count change is not a verified inflow rate. Raw IDs, filenames, frame numbers and timestamps are excluded from the model matrix. Missing observations are not zero people. No physical pressure or density can be inferred from these inputs.

## Review labels

Open labels_to_review.json, confirm the source video, and split the interval into observed events. Every interval needs start_s, end_s, state, visibility, reviewer and optional notes. Times are start-inclusive/end-exclusive. Intervals must be sorted and nonoverlapping.

State: free_flow, congested, surge or unknown. Visibility: clear, obscured or unreviewed. Surge denotes a reviewed sudden collective movement event, not every dense crowd or every frame in an abnormal-dataset folder. Congestion concerns restricted movement/accumulation; a standing audience or normal queue is not automatically congestion. If multiple zones differ, use unknown for Full view and reserve that clip for future zone annotation. Do not infer intention or label people as dangerous.

Example syntax only (NOT supplied-video ground truth):

```json
{
  "video_id": "your_recording_id",
  "source_video": "matching_video.mp4",
  "zone": "Full view",
  "intervals": [
    {"start_s": 0, "end_s": 10, "state": "unknown", "visibility": "unreviewed", "reviewer": "", "notes": "Watch and annotate"}
  ]
}
```

```powershell
python .\backend\backend.py label `
  --features .\outputs\training_data\recording_b\features.jsonl `
  --labels .\outputs\training_data\recording_b\labels_to_review.json `
  --output .\outputs\training_data\recording_b\labelled.jsonl
```

The join uses features available through t to label the state at t+2 seconds. It requires reviewed clear history and a reviewed clear future label, and rejects low-continuity windows. It never uses the future state as an input feature. Visibility labels here are an offline review gate, not a validated automatic visibility system. All-unknown annotations produce zero labelled windows.

## Train and evaluate

Collect multiple independent events covering the desired classes. Keep clips from the same original event in one split. Copy examples/training_manifest.json, replace its placeholder paths and event groups, and set grouping_reviewed=true only after that review. Paths resolve relative to the manifest. Provide independent training, validation and test recordings, each covering all evaluated classes. The grouping checks prevent obvious overlap but cannot identify hidden duplicate events from different edits.

```powershell
python .\backend\backend.py train `
  --manifest .\backend\examples\training_manifest.json `
  --output .\outputs\models\crowd_event_v1
```

The example manifest is intentionally incomplete: it must be populated before training. A completed run writes model.joblib and evaluation.json to a new directory. No real-data model is included in this ZIP.

The fixed small Random Forest is a baseline, not a claim of optimal architecture. Median imputation is fitted on training data only. Metrics include per-class precision/recall/F1, confusion matrices, persistence baseline and a currently-free-flow subset that helps distinguish ongoing-event recognition from onset forecasting. This version does not calculate validated event-level lead time or false alerts per hour. Correlated windows are not independent trials; technically passing the split checks does not establish adequate sample size. Uncalibrated class scores are not real-world surge-risk probabilities. A model trained without a surge class cannot claim surge detection. Test-set retuning requires a new untouched test set.

## Offline inference

```powershell
python .\backend\backend.py predict `
  --model .\outputs\models\crowd_event_v1\model.joblib `
  --features .\outputs\training_data\new_recording\features.jsonl `
  --visibility .\outputs\training_data\new_recording\labels_to_review.json `
  --output .\outputs\new_recording_predictions.jsonl
```

Only history visibility is consulted for inference; event-state annotations can remain unknown. Unreviewed or unreliable history outputs UNKNOWN. Load only your own trusted joblib models. These commands currently operate on completed files. A streaming service, automated visibility gating, classifier/flow fusion and front-end integration are later milestones.

## Build verification

Run `python -m unittest discover -s .\backend -p "test_*.py"`.

Backend tests cover annotation gaps and boundaries, temporal label alignment, event split leakage, class coverage and a complete synthetic training/save/predict cycle. Synthetic test metrics are deliberately not presented as model accuracy; temporary test models are deleted. Flow/signal tests cover counterflow, degraded tiles, stale observations and missing IDs. Actual-video extraction and the Windows GPU environment remain unverified in the build runtime because OpenCV and Ultralytics were unavailable there.

References: https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html and https://scikit-learn.org/stable/modules/cross_validation.html
