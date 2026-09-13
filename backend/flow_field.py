"""Detector-independent zone motion and frozen-field tracer projections.

Inputs are dense image velocities in ROI px/s, not person velocities.
Tracers are virtual probes, never crowd counts. Thresholds are provisional.
"""
import numpy as np


class FlowField:
    def __init__(self):
        self.previous_tracks = {}
        self.last_t = None
        self.previous_states = ['WARMING UP']*9

    def update(self, t, field, width, height, tile_states, observations):
        dt = None if self.last_t is None else t-self.last_t
        usable_time = dt is not None and 0 < dt <= .5
        previous_states = self.previous_states
        previous = self.previous_tracks
        self.previous_tracks = {tid:(x,y) for tid,x,y in observations}
        self.last_t = t
        velocities = [[] for _ in range(9)]
        def index(x,y):
            return min(2,int(y/height*3))*3+min(2,int(x/width*3))
        if usable_time:
            for tid,x,y in observations:
                if tid in previous and 0 <= x < width and 0 <= y < height:
                    px,py = previous[tid]
                    # Do not bridge a previous blind zone or a zone boundary.
                    k = index(x,y)
                    if index(px,py) == k and self.previous_states[k] == 'REFERENCE-LIKE':
                        velocities[k].append(((x-px)/dt,(y-py)/dt))
        self.previous_states = list(tile_states)
        cells = []
        valid_field = field is not None and usable_time
        if valid_field:
            fh,fw = field.shape[:2]
        for k in range(9):
            c = dict(cell=f'R{k//3+1}C{k%3+1}', state='WAITING', vx=None,vy=None,
                     speed_px_s=None, active_fraction=0., coherence=None,
                     track_vx=None,track_vy=None, agreement=None, comparison='NO TRACK COMPARISON')
            if tile_states[k] != 'REFERENCE-LIKE':
                c['state'] = tile_states[k]
            elif previous_states[k] != 'REFERENCE-LIKE':
                c['state'] = 'RECOVERING: NEED CLEAR FRAME PAIR'
            elif valid_field:
                tile = field[k//3*fh//3:(k//3+1)*fh//3,k%3*fw//3:(k%3+1)*fw//3]
                v = tile.reshape(-1,2)
                v = v[np.isfinite(v).all(axis=1)]
                speed = np.linalg.norm(v,axis=1)
                active = speed > 3.
                c['active_fraction'] = float(active.sum()/max(len(v),1))
                if active.sum() < 8 or c['active_fraction'] < .02:
                    c['state'] = 'LITTLE MEASURABLE MOTION'
                else:
                    moving = v[active]
                    unit = moving/speed[active,None]
                    coherence = float(np.linalg.norm(unit.mean(axis=0)))
                    mean = moving.mean(axis=0)
                    c.update(vx=float(mean[0]),vy=float(mean[1]),speed_px_s=float(np.median(speed[active])),
                             coherence=coherence,state='COHERENT SCENE FLOW' if coherence >= .65 else 'MIXED SCENE MOTION')
                    tv = velocities[k]
                    if len(tv) >= 3:
                        track = np.median(tv,axis=0)
                        c.update(track_vx=float(track[0]),track_vy=float(track[1]))
                        denom = float(np.linalg.norm(track)*np.linalg.norm(mean))
                        if coherence < .65:
                            c['comparison'] = 'MIXED FLOW: INSPECT ZONE'
                        elif np.linalg.norm(track) < 3 or np.linalg.norm(mean) < 3:
                            c['comparison'] = 'LOW MOTION: NO DIRECTION COMPARISON'
                        elif denom > 0:
                            cosine = float(np.clip(np.dot(track,mean)/denom,-1,1))
                            c['agreement'] = cosine
                            c['comparison'] = 'DIRECTIONS AGREE' if cosine >= .5 else 'DIRECTIONS DISAGREE'
            cells.append(c)
        paths = []
        # Euler integration through the current piecewise-constant zone field.
        # No velocity extrapolation through bad zones, beyond ROI or past 2 s.
        for k,c in enumerate(cells):
            if c['state'] != 'COHERENT SCENE FLOW' or c['comparison'] == 'DIRECTIONS DISAGREE':
                continue
            x,y = (k%3+.5)*width/3,(k//3+.5)*height/3
            points = [(0.,x,y)]
            end = '2 s horizon reached'
            for step in range(1,21):
                local = cells[index(x,y)]
                if local['state'] != 'COHERENT SCENE FLOW' or local['comparison'] == 'DIRECTIONS DISAGREE':
                    end = 'Unreliable or mixed zone'; break
                nx,ny = x+.1*local['vx'], y+.1*local['vy']
                if not (0 <= nx < width and 0 <= ny < height):
                    end = 'Leaves selected region'; break
                dest = cells[index(nx,ny)]
                if dest['state'] != 'COHERENT SCENE FLOW' or dest['comparison'] == 'DIRECTIONS DISAGREE':
                    end = 'Unreliable or mixed zone'; break
                x,y = nx,ny
                points.append((round(step*.1,1),x,y))
            paths.append(dict(origin=c['cell'],points=points,end=end))
        return dict(cells=cells,paths=paths,
                    model='Frozen zone scene-velocity field; virtual tracers, not people or congestion probabilities')
