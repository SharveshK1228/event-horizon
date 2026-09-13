"""Prepare causal, full-view training windows; Python standard library only.
No congestion labels are inferred from the input. Run separately per recording.
"""
import argparse
import csv
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean, median


def prepare(source, video_id, output, window=3., horizon=2., stride=1.):
    source,output=Path(source),Path(output)
    if min(window,horizon,stride)<=0: raise ValueError('Durations must be positive')
    frames=defaultdict(dict); times={}; rows=0
    with source.open(newline='',encoding='utf-8-sig') as handle:
        reader=csv.DictReader(handle)
        required={'frame','time_s','track_id','anchor_x','anchor_y'}
        if not required.issubset(reader.fieldnames or []): raise ValueError('Missing required trajectory columns')
        for r in reader:
            f=int(r['frame']); t=float(r['time_s']); tid=r['track_id']
            x,y=float(r['anchor_x']),float(r['anchor_y'])
            if not all(math.isfinite(v) for v in (t,x,y)) or t<0: raise ValueError('Invalid time/position')
            if tid in frames[f]: raise ValueError('Duplicate frame/track ID')
            if f in times and times[f]!=t: raise ValueError('Inconsistent frame timestamp')
            frames[f][tid]=(x,y);times[f]=t;rows+=1
    order=sorted(frames)
    if len(order)<2: raise ValueError('At least two frames required')
    if any(times[b]<=times[a] for a,b in zip(order,order[1:])): raise ValueError('Frame times must increase')
    per_frame=[];prev={};pf=None;pt=None
    for f in order:
        cur=frames[f];t=times[f];v=[]
        if pf is not None and f==pf+1 and 0<t-pt<=.5:
            for tid,(x,y) in cur.items():
                if tid in prev:
                    px,py=prev[tid];v.append(((x-px)/(t-pt),(y-py)/(t-pt)))
        speed=[math.hypot(*a) for a in v]
        moving=[a for a in v if math.hypot(*a)>5]
        coherence=None
        if moving:
            ux=mean(a/math.hypot(a,b) for a,b in moving)
            uy=mean(b/math.hypot(a,b) for a,b in moving)
            coherence=math.hypot(ux,uy)
        per_frame.append(dict(time_s=t,count=len(cur),speed=median(speed) if speed else None,
            slow=mean(s<5 for s in speed) if speed else None,coherence=coherence,
            continuity=len(v)/len(cur),frame=f))
        prev,pf,pt=cur,f,t
    first,last=times[order[0]],times[order[-1]]
    samples=[];end=first+window
    def avg(data,key):
        vals=[r[key] for r in data if r[key] is not None]
        return mean(vals) if vals else None
    while end+horizon<=last+1e-8:
        # Exclude the boundary so endpoint velocities do not use pre-window positions.
        inside=[r for r in per_frame if end-window<r['time_s']<=end]
        if inside:
            tm=mean(r['time_s'] for r in inside);cm=mean(r['count'] for r in inside)
            denom=sum((r['time_s']-tm)**2 for r in inside)
            slope=sum((r['time_s']-tm)*(r['count']-cm) for r in inside)/denom if denom else 0
            samples.append(dict(video_id=video_id,zone='Full view',
                history_start_s=round(end-window,4),history_end_s=round(end,4),
                target_time_s=round(end+horizon,4),features=dict(
                    mean_visible_tracks=cm,count_change_per_s=slope,
                    median_frame_speed_px_s=avg(inside,'speed'),slow_fraction_px_threshold=avg(inside,'slow'),
                    direction_coherence=avg(inside,'coherence'),track_continuity=avg(inside,'continuity'),
                    observed_frames=len(inside)),label=None))
        end+=stride
    output.mkdir(parents=True,exist_ok=True)
    (output/'features.jsonl').write_text(''.join(json.dumps(s,allow_nan=False)+'\n' for s in samples))
    # Never overwrite a user's annotations on rerun.
    label_path=output/'labels_to_review.json'
    if not label_path.exists():
        label_path.write_text(json.dumps(dict(video_id=video_id,source_video='CONFIRM_MATCHING_VIDEO_FILENAME',
            zone='Full view',interval_convention='start inclusive, end exclusive',
            intervals=[dict(start_s=first,end_s=last,state='unknown',visibility='unreviewed',reviewer='',notes='Split into intervals after watching the matching video.')],
            allowed_states=['free_flow','congested','surge','unknown'],
            allowed_visibility=['clear','obscured','unreviewed']),indent=2))
    audit=dict(video_id=video_id,source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        trajectory_rows=rows,observed_frames=len(order),first_time_s=first,last_time_s=last,
        unique_video_local_ids=len(set().union(*(set(x) for x in frames.values()))),
        candidate_windows=len(samples),labelled_windows=0,window_s=window,horizon_s=horizon,stride_s=stride,
        training_status='NOT TRAINED: labels and adequate independent recording coverage required',
        limitations=['Full-view preparation only; confirm source video pairing before labelling.',
            'CSV omits frames with no tracks; absent frames are unknown, never assumed zero population.',
            'Motion is recomputed only for IDs in consecutive frames with gaps <=0.5 s.',
            'Raw IDs, frame indices and filenames must not be model features.',
            'Counts and pixel speeds are camera-specific and affected by detection/tracking errors.',
            'Slow threshold 5 px/s is a feature setting, not a congestion definition.',
            'Overlapping windows are correlated. Hold out whole independent recordings/events.',
            'Labels stay null until reviewed visibility and future congestion states are joined.'])
    (output/'audit.json').write_text(json.dumps(audit,indent=2))
    return audit


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--trajectories',required=True);p.add_argument('--video-id',required=True)
    p.add_argument('--output',required=True);p.add_argument('--window',type=float,default=3.)
    p.add_argument('--horizon',type=float,default=2.);p.add_argument('--stride',type=float,default=1.)
    a=p.parse_args()
    print(json.dumps(prepare(a.trajectories,a.video_id,a.output,a.window,a.horizon,a.stride),indent=2))
