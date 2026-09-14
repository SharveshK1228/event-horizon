// Explicitly simulated scenarios. Nothing here is a model result; the UI must
// keep labelling it SIMULATED wherever it is displayed.

export const scenarios = {
  clear: {
    title: 'Clear view with observed motion',
    count: 1210,
    direction: 'East · image space',
    visibility: 'Reference-like',
    tracking: 'TRACK MOTION AVAILABLE',
    motion: 'OBSERVED MOTION',
    fps: 19.9,
    issue: null,
  },
  tracking: {
    title: 'Tracking unavailable',
    count: null,
    direction: 'Unreliable',
    visibility: 'Unverified',
    tracking: 'TRACKING UNAVAILABLE',
    motion: 'FLOW AVAILABLE; PERSON MOTION UNAVAILABLE',
    fps: 19.9,
    issue: 'Tracking unavailable',
  },
  visibility: {
    title: 'Visibility degraded',
    count: null,
    direction: 'Unavailable',
    visibility: 'Degraded',
    tracking: 'TRACKING UNAVAILABLE',
    motion: 'UNRELIABLE',
    fps: 12.4,
    issue: 'Visibility degraded',
  },
  camera: {
    title: 'Camera movement suspected',
    count: null,
    direction: 'Suspended',
    visibility: 'Unverified',
    tracking: 'INSUFFICIENT TRACK SUPPORT',
    motion: 'CAMERA MOVEMENT SUSPECTED',
    fps: 13.2,
    issue: 'Camera movement suspected',
  },
  collective: {
    title: 'Unusual collective movement',
    count: 1942,
    direction: 'Rapid reversal · image space',
    visibility: 'Reference-like',
    tracking: 'TRACK MOTION AVAILABLE',
    motion: 'UNUSUAL COLLECTIVE MOVEMENT',
    fps: 9.8,
    issue: 'Unusual collective movement — verify',
  },
  // The two timeline scenarios below play out over several minutes rather than
  // holding one state. Their counts, direction and FPS are recomputed from the
  // timeline on every tick, so the fields here are only the opening frame.
  surge: {
    title: 'Egress surge — concourse congests',
    count: null,
    direction: 'South · toward the gate line',
    visibility: 'Reference-like',
    tracking: 'TRACK MOTION AVAILABLE',
    motion: 'OBSERVED MOTION',
    fps: 17.2,
    issue: 'Concentration building at the exit funnel',
    timeline: true,
  },
  crush: {
    title: 'Crush conditions — gates lost during egress',
    count: null,
    direction: 'South with counterflow · image space',
    visibility: 'Reference-like',
    tracking: 'TRACK MOTION AVAILABLE',
    motion: 'UNUSUAL COLLECTIVE MOVEMENT',
    fps: 11.6,
    issue: 'Crush-risk density at the exit funnel — verify',
    timeline: true,
  },
};

export const sampleSop = {
  sop_id: 'SOP-VERIFY-01',
  version: '0.1',
  title: 'Verify camera and crowd assessment',
  approval_status: 'Sample SOP — demonstration only',
  reactive: [
    'Verify the current camera image.',
    'Check for obstruction or camera movement.',
    'Review another available view if assessment is unreliable.',
  ],
  proactive: [
    'Monitor whether the condition persists.',
    'Prepare the incident evidence for the designated supervisor.',
  ],
  escalation: [
    'Follow the venue-approved escalation procedure if assessment remains unavailable.',
  ],
  recovery: [
    'Confirm usable evidence has returned; restored tracking alone does not establish crowd safety.',
  ],
};

/**
 * Scripted signal feed shown in the twin overlay. Ordered oldest → newest;
 * the store replays them on a timer so the panel reads like a live log.
 */
export const signalScripts = {
  clear: [
    { source: 'Detector', message: 'Head detector reporting 214 boxes this interval. Confidence not calibrated.' },
    { source: 'Tracker', message: 'BoT-SORT holding 176 continuous IDs. Track coverage 82% of detections.' },
    { source: 'Flow', message: 'Farneback net direction east in image space. Agrees with track motion.' },
    { source: 'Visibility', message: 'All 9 tiles within reference contrast, sharpness and exposure bounds.' },
    { source: 'Forecast', message: 'Constant-velocity projection available at +1, +2 and +3 s.' },
  ],
  tracking: [
    { source: 'Detector', message: 'No usable detections returned for this interval.' },
    { source: 'Tracker', message: 'Tracking unavailable. Missing detections do not establish an empty scene.' },
    { source: 'Flow', message: 'Optical flow still available. This is scene motion, not person motion.' },
    { source: 'Forecast', message: 'Projection suspended: fewer than 3 eligible continuous tracks.' },
  ],
  visibility: [
    { source: 'Visibility', message: 'Tile quality degraded against the initial reference. Assessment unreliable.' },
    { source: 'Tracker', message: 'Track memory frozen. Degraded frames cannot refresh last reliable positions.' },
    { source: 'Flow', message: 'Motion inference suspended while the view is degraded.' },
    { source: 'Forecast', message: 'Projection suspended and track history reset.' },
  ],
  camera: [
    { source: 'Flow', message: 'Global motion pattern consistent with camera movement, not crowd movement.' },
    { source: 'Tracker', message: 'Insufficient track support: coverage 8% of current detections.' },
    { source: 'Visibility', message: 'Tiles unverified while the view is unstable.' },
    { source: 'Forecast', message: 'Projection withheld until the view stabilises.' },
  ],
  collective: [
    { source: 'Detector', message: 'Head detector reporting 1942 boxes this interval.' },
    { source: 'Tracker', message: 'Sustained direction reversal across 3 consecutive windows.' },
    { source: 'Flow', message: 'Net flow and track motion agree on reversal. Camera motion not suspected.' },
    { source: 'Forecast', message: 'R3C2 projected above the configured threshold at +2 s. Operator review required.' },
  ],
  surge: [
    { source: 'Timeline', message: 'Simulated egress timeline loaded. Playback drives every count below.' },
    { source: 'Forecast', message: 'Constant-velocity projection running at +1, +2 and +3 s.' },
  ],
  crush: [
    { source: 'Timeline', message: 'Simulated egress timeline with two gates lost at T-01:30.' },
    { source: 'Forecast', message: 'Constant-velocity projection running at +1, +2 and +3 s.' },
  ],
};

/**
 * One line per timeline keyframe, pushed to the signal feed as playback
 * crosses that phase. Indices match the keyframes in `data/crowdTimeline.js`.
 */
export const phaseSignals = {
  surge: [
    { source: 'Tracker', message: 'Stands populated, concourses light. 82% of detections held as continuous tracks.' },
    { source: 'Flow', message: 'Net track direction turning south toward the gate line.' },
    { source: 'Forecast', message: 'Central concourse and exit funnel rising together across consecutive windows.' },
    { source: 'Forecast', message: 'Exit funnel arrivals exceeding gate throughput in the projection.' },
    { source: 'Tracker', message: 'Slow fraction rising in R3C2. Walking speed dropping, not stopping.' },
    { source: 'Forecast', message: 'R3C2 in the congested band. Inspect gate throughput before the queue deepens.' },
    { source: 'Flow', message: 'Arrival rate now below throughput. Projected change turning negative.' },
    { source: 'Forecast', message: 'Densities returning toward free movement. This is not an all-clear.' },
  ],
  crush: [
    { source: 'Tracker', message: 'Stands populated, concourses light. 82% of detections held as continuous tracks.' },
    { source: 'Flow', message: 'Net track direction turning south toward the gate line.' },
    { source: 'Forecast', message: 'Concourses loading at the rate the surge scenario shows.' },
    { source: 'Timeline', message: 'Simulated loss of two of six gates. Throughput falls; arrivals do not.' },
    { source: 'Forecast', message: 'R3C2 past the congested band with inflow unchanged. Operator review required.' },
    { source: 'Forecast', message: 'R3C2 in the crush-risk band. Movement is involuntary at this density.' },
    { source: 'Tracker', message: 'Counterflow at the queue front. Track coverage falling as heads occlude.' },
    { source: 'Forecast', message: 'R3C2 in the critical band. Counts here are least reliable exactly when they matter most.' },
    { source: 'Forecast', message: 'Condition persisting. Nothing in this console resolves it.' },
  ],
};
