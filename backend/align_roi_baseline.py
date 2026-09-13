"""Align cropped flow and source trajectories; evaluate persistence, not a learned model.
Uses a training-input ZIP, avoiding changes to original logs. Standard library only.
"""
import argparse,csv,io,json,math,zipfile
from collections import defaultdict,Counter
from pathlib import Path
from statistics import mean,median

def run(archive,flow,summary,output):
 meta=json.loads(Path(summary).read_text(encoding='utf-8-sig'))
 logs=[json.loads(s) for s in Path(flow).read_text(encoding='utf-8-sig').splitlines() if s.strip()]
 if meta['status']!='complete' or len(logs)!=meta['frames']:raise ValueError('Incomplete flow')
 fps=float(meta['fps']);offset=meta['source_start_frame'];rx,ry,w,h=meta['roi_xywh']
 frames=defaultdict(dict)
 with zipfile.ZipFile(archive) as z:
  names={n.replace('\\','/'):n for n in z.namelist()}
  matches=[]
  for n in names:
   if n.endswith('/run_summary.json'):
    t=json.loads(z.read(names[n]))
    if t['source'].replace('\\','/')==meta['source'].replace('\\','/'):matches.append((n,t))
  if len(matches)!=1:raise ValueError('Need exactly one matching source run')
  n,t=matches[0]
  if abs(t['source_fps']-fps)>.001 or [t['width'],t['height']]!=meta['source_dimensions_wh']:raise ValueError('Source geometry/timing mismatch')
  path=n.rsplit('/',1)[0]+'/trajectories.csv'
  with z.open(names[path]) as raw:
   for row in csv.DictReader(io.TextIOWrapper(raw,encoding='utf-8-sig')):
    f=int(row['frame'])
    if not offset<=f<offset+len(logs):continue
    x=float(row['anchor_x'])-rx;y=float(row['anchor_y'])-ry
    if abs(float(row['time_s'])-f/fps)>.001:raise ValueError('Trajectory timestamp mismatch')
    if 0<=x<w and 0<=y<h:
     tid=row['track_id']
     if tid in frames[f]:raise ValueError('Duplicate frame track')
     frames[f][tid]=(x,y)
 def zone(x,y):return min(2,int(y*3/h))*3+min(2,int(x*3/w))
 paired=[];bins=defaultdict(list)
 order=[f'R{i}C{j}' for i in range(1,4) for j in range(1,4)]
 for i,row in enumerate(logs):
  f=offset+i
  if row['frame']!=i or row['source_frame']!=f or abs(row['time_s']-i/fps)>.001 or abs(row['source_time_s']-f/fps)>.001 or row['roi_xywh']!=meta['roi_xywh']:raise ValueError('Flow alignment mismatch')
  if [c['cell'] for c in row['cells']]!=order:raise ValueError('Grid mismatch')
  local=[[] for _ in range(9)];counts=[0]*9
  for tid,(x,y) in frames.get(f,{}).items():
   k=zone(x,y);counts[k]+=1
   if tid in frames.get(f-1,{}):
    px,py=frames[f-1][tid]
    if zone(px,py)==k:local[k].append(((x-px)*fps,(y-py)*fps))
  for k,c in enumerate(row['cells']):
   v=local[k];p={'frame':i,'source_frame':f,'time_s':row['time_s'],'cell':order[k],'flow_state':c['state'],'flow_vx':c['vx'],'flow_vy':c['vy'],'track_count':counts[k],'track_support':len(v),'track_vx':median(a for a,b in v) if len(v)>=3 else None,'track_vy':median(b for a,b in v) if len(v)>=3 else None}
   paired.append(p);bins[(int(row['time_s']),k)].append(p)
 features={}
 for (sec,k),rows in bins.items():
  valid=[p for p in rows if p['flow_state'] in ('COHERENT SCENE FLOW','MIXED SCENE MOTION') and p['flow_vx'] is not None and p['flow_vy'] is not None]
  tracks=[p for p in rows if p['track_vx'] is not None]
  features[(sec,k)]={'flow_vx':mean(p['flow_vx']/w for p in valid) if valid else None,'flow_vy':mean(p['flow_vy']/h for p in valid) if valid else None,'valid_fraction':len(valid)/len(rows),'track_vx':mean(p['track_vx']/w for p in tracks) if tracks else None,'track_vy':mean(p['track_vy']/h for p in tracks) if tracks else None,'track_support_fraction':len(tracks)/len(rows),'mean_tracked_detections':mean(p['track_count'] for p in rows)}
 windows=[];errors=[];zero=[];per=defaultdict(list)
 # Exclude initialization (0..4 s) and final incomplete second.
 for end in range(7,math.floor(len(logs)/fps)):
  for k in range(9):
   history=[features[(s,k)] for s in range(end-3,end)];future=features[(end,k)]
   if not all(p['valid_fraction']>=.8 for p in history+[future]):continue
   pred=[history[-1]['flow_vx'],history[-1]['flow_vy']];target=[future['flow_vx'],future['flow_vy']]
   error=math.dist(pred,target);errors.append(error);zero.append(math.hypot(*target));per[order[k]].append(error)
   windows.append({'cell':order[k],'forecast_origin_s':end,'source_forecast_origin_s':offset/fps+end,'history':history,'target':target,'persistence_prediction':pred,'persistence_error':error,'training_approved':False})
 result={'source':meta['source'],'roi_xywh':meta['roi_xywh'],'frames':len(logs),'frames_with_roi_tracks':len(frames),'roi_trajectory_rows':sum(map(len,frames.values())),'paired_zone_observations':len(paired),'zone_observations_with_track_motion':sum(p['track_support']>=3 for p in paired),'eligible_windows':len(windows),'persistence_mean_vector_error':mean(errors) if errors else None,'zero_motion_mean_vector_error':mean(zero) if zero else None,'per_zone':{k:{'windows':len(v),'persistence_mean_vector_error':mean(v)} for k,v in per.items()},'units':'Euclidean velocity error: x normalized by ROI width, y by ROI height; per second','limitations':['One scene diagnostic, not held-out forecasting performance.','Targets are next-second optical-flow means, not ground-truth crowd movement.','Only windows passing flow coverage are evaluated; selection is not representative of the whole scene.','Tracking absence is missing evidence, not absence of people.','Camera/ROI review remains provisional; no learned model trained.']}
 out=Path(output);out.mkdir(parents=True,exist_ok=True)
 for filename,data in [('paired_zone_motion.jsonl',paired),('forecast_windows.jsonl',windows)]:
  (out/filename).write_text(''.join(json.dumps(r,allow_nan=False)+'\n' for r in data),encoding='utf-8')
 (out/'baseline_summary.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 for key in ('archive','flow','summary','output'):p.add_argument('--'+key,required=True)
 a=p.parse_args();print(json.dumps(run(a.archive,a.flow,a.summary,a.output),indent=2))
