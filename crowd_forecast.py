"""Image-space constant-velocity baseline; not a trained crowd-risk model."""
from collections import deque
from math import hypot, isfinite


class CrowdForecast:
    def __init__(self, threshold=10, slow_px_s=5, coverage=.6):
        self.threshold = threshold
        self.slow_px_s = slow_px_s
        self.min_coverage = coverage
        self.history = {}

    def update(self, t, observations, total, width, height, quality, signal):
        result = dict(status='UNAVAILABLE', reason='', coverage=0., cells=[],
                      advice='Check the view and track continuity before interpreting crowd movement.')
        if quality != 'REFERENCE-LIKE' or signal == 'SIGNALS DISAGREE':
            self.history.clear()
            result['reason'] = 'Visibility changed or the motion signals disagree.'
            return result
        current = {tid: (x, y) for tid, x, y in observations
                   if all(isfinite(v) for v in (x, y)) and 0 <= x < width and 0 <= y < height}
        self.history = {tid: h for tid, h in self.history.items() if tid in current}
        moving = []
        for tid, (x, y) in current.items():
            h = self.history.setdefault(tid, deque())
            if h and not 0 < t-h[-1][0] <= .5:
                h.clear()
            h.append((t, x, y))
            while len(h) > 1 and t-h[0][0] > 1.:
                h.popleft()
            if len(h) >= 3 and t-h[0][0] >= .3:
                # Least-squares velocity smooths position jitter over recent history.
                mt = sum(v[0] for v in h)/len(h)
                mx = sum(v[1] for v in h)/len(h)
                my = sum(v[2] for v in h)/len(h)
                denom = sum((v[0]-mt)**2 for v in h)
                vx = sum((a-mt)*(b-mx) for a,b,c in h)/denom
                vy = sum((a-mt)*(c-my) for a,b,c in h)/denom
                moving.append((x, y, vx, vy))
        result['coverage'] = len(moving)/max(total, 1)
        if len(moving) < 3 or result['coverage'] < self.min_coverage:
            result['reason'] = 'Too few continuous tracks: need at least 3 and 60% of current detections.'
            return result
        def cell(x, y):
            return min(2, int(y/height*3))*3 + min(2, int(x/width*3))
        now = [0]*9
        slow = [0]*9
        for x,y,vx,vy in moving:
            k = cell(x,y)
            now[k] += 1
            slow[k] += hypot(vx,vy) < self.slow_px_s
        for horizon in (1,2,3):
            projected = [0]*9
            for x,y,vx,vy in moving:
                xx,yy = x+horizon*vx,y+horizon*vy
                if 0 <= xx < width and 0 <= yy < height:
                    projected[cell(xx,yy)] += 1
            for k in range(9):
                flag = projected[k] >= self.threshold
                result['cells'].append(dict(cell=f'R{k//3+1}C{k%3+1}', horizon_s=horizon,
                    current_eligible=now[k], projected_tracks=projected[k],
                    change=projected[k]-now[k], slow_fraction=slow[k]/now[k] if now[k] else None,
                    concentration_flag=flag))
        hotspots = [c for c in result['cells'] if c['concentration_flag']]
        result['status'] = 'REVIEW CONCENTRATION' if hotspots else 'PROJECTION AVAILABLE'
        result['reason'] = 'Constant-velocity projection of eligible observed tracks only.'
        if hotspots:
            peak = max(hotspots, key=lambda c: (c['projected_tracks'], -c['horizon_s']))
            result['advice'] = (f"Inspect {peak['cell']}: {peak['projected_tracks']} eligible tracks projected "
                f"at +{peak['horizon_s']} s. Review bottlenecks and entry rate. Check venue conditions "
                'before considering another route; this model does not establish route safety.')
        else:
            result['advice'] = 'No configured concentration threshold exceeded in this projection. This is not an all-clear.'
        return result
