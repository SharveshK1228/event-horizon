"""Pure-Python observation memory and provisional signal fusion."""
import math
from statistics import median


class QualityReference:
    """Relative tile contrast/sharpness/exposure check, not an occlusion detector."""
    def __init__(self, ratio=.3, changed_tiles=2):
        self.ratio = ratio
        self.changed_tiles = changed_tiles
        self.samples = []
        self.reference = None
        self.start = None

    def update(self, timestamp, features):
        if self.start is None:
            self.start = timestamp
        if self.reference is None:
            self.samples.append(features)
            if timestamp-self.start >= 3 and len(self.samples) >= 10:
                self.reference = [[median(s[i][j] for s in self.samples) for j in range(3)] for i in range(len(features))]
                self.samples.clear()
            return 'WARMING UP',0
        changed = sum(c < max(rc*self.ratio,3) or sharp < max(rs*self.ratio,2) or exposure > max(re+.35,.8)
                      for (c,sharp,exposure),(rc,rs,re) in zip(features,self.reference))
        return ('DEGRADED' if changed >= self.changed_tiles else 'REFERENCE-LIKE'),changed


class SignalMemory:
    def __init__(self, ttl=2.0):
        self.ttl = ttl
        self.tracks = {}
        self.previous_ids = set()

    def update(self, timestamp, observations, reliable):
        # Never refresh memory with detections from a degraded view.
        old = self.tracks
        velocity = []
        current = set()
        if reliable:
            for tid, x, y in observations:
                current.add(tid)
                if tid in old and tid in self.previous_ids:
                    t0, x0, y0 = old[tid]
                    dt = timestamp - t0
                    # A reacquired ID is not evidence of continuous movement.
                    if 0 < dt <= 0.5:
                        velocity.append(((x-x0)/dt, (y-y0)/dt))
                old[tid] = (timestamp, x, y)
        self.tracks = {k:v for k,v in old.items() if 0 <= timestamp-v[0] <= self.ttl}
        self.previous_ids = current
        ghosts = [(tid, x, y, timestamp-t) for tid,(t,x,y) in self.tracks.items() if tid not in current]
        vector = None
        if len(velocity) >= 3:
            vector = tuple(sum(v[i] for v in velocity)/len(velocity) for i in (0,1))
        return ghosts, vector


def infer(quality, count, track_vector, flow_vector, count_threshold):
    if quality == 'WARMING UP':
        return 'CALIBRATING', 'Use a clear, representative view for the initial reference.'
    if quality != 'REFERENCE-LIKE':
        return 'VISIBILITY CHECK', 'View quality changed. Check the camera or use another view; crowd inference is suspended.'
    if track_vector is None or flow_vector is None:
        return 'INSUFFICIENT MOTION', 'Waiting for enough continuous tracks and visible scene motion.'
    a = math.hypot(*track_vector)
    b = math.hypot(*flow_vector)
    if a < 3 or b < 3:
        message = 'Little net motion observed; opposing flows can cancel in an average.'
        return ('COUNT THRESHOLD' if count >= count_threshold else 'LOW NET MOTION'), message
    agreement = sum(x*y for x,y in zip(track_vector,flow_vector))/(a*b)
    if agreement < 0.5:
        return 'SIGNALS DISAGREE', 'Track motion and scene motion differ. Inspect spray, camera motion, or detection gaps.'
    if count >= count_threshold:
        return 'COUNT THRESHOLD', 'Visible detections exceed the configured threshold; inspect the selected region.'
    return 'FLOW AGREES', 'The two net directions agree. This does not establish safe crowd conditions.'
