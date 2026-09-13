"""Prepare review-only 3-second history / next-second zone-motion windows.
Reads the exported training ZIP directly. Standard-library Python only.
No surge labels, camera compensation, train/test split or model training.
"""
import argparse,csv,io,json,math,zipfile
from collections import defaultdict
from pathlib import Path

def prepare(archive,output):
 out=Path(output);out.mkdir(parents=True,exist_ok=True)
 audits=[];total=0;eligible_total=0
 with zipfile.ZipFile(archive) as z, (out/'windows.jsonl').open('w',encoding='utf-8') as dest:
  members={n.replace('\\','/'):n for n in z.namelist()}
  for name in sorted(members):
   if not name.endswith('/run_summary.json'):continue
   folder=name.rsplit('/',1)[0]
   def read_json(suffix):return json.loads(z.read(members[folder+'/'+suffix]))
   meta=read_json('run_summary.json');flow_meta=read_json('flow_summary.json')
   fps=float(meta['source_fps']);count=int(meta['frames_processed'])
   width,height=meta['width'],meta['height']
   if meta['status']!='completed' or flow_meta['status']!='complete':raise ValueError('Incomplete run')
   if abs(float(flow_meta['fps'])-fps)>.001 or int(flow_meta['frames'])!=count:raise ValueError('Summary alignment mismatch')
   frame_counts=defaultdict(int);zone_counts=defaultdict(int);rows=0;last_frame=-1;ids=set()
   with z.open(members[folder+'/trajectories.csv']) as raw:
    for row in csv.DictReader(io.TextIOWrapper(raw,encoding='utf-8-sig')):
     f=int(row['frame']);t=float(row['time_s']);x=float(row['anchor_x']);y=float(row['anchor_y'])
     if not 0<=f<count or not all(math.isfinite(v) for v in (t,x,y)) or abs(t-f/fps)>.001:raise ValueError('Bad trajectory time/value')
     if f<last_frame:raise ValueError('Trajectory frames must be sorted')
     if f!=last_frame:ids=set();last_frame=f
     if row['track_id'] in ids:raise ValueError('Duplicate track/frame')
     ids.add(row['track_id']);frame_counts[f]+=1;rows+=1
     if 0<=x<width and 0<=y<height:
      k=min(2,int(y*3/height))*3+min(2,int(x*3/width));zone_counts[(int(t),k)]+=1
   if rows!=meta['trajectory_rows']:raise ValueError('Trajectory row count mismatch')
   bins=defaultdict(lambda:{'frames':0,'with_tracks':0,'cells':[{'n':0,'vx':0.,'vy':0.,'coherence':0.,'active':0.,'mixed':0} for _ in range(9)]})
   expected=0
   with z.open(members[folder+'/zone_flow.jsonl']) as raw:
    for line in raw:
     r=json.loads(line);f=r['frame'];t=r['time_s']
     if f!=expected or abs(t-f/fps)>.001:raise ValueError('Flow frame/time gap')
     expected+=1;b=bins[int(t)];b['frames']+=1;b['with_tracks']+=int(frame_counts.get(f,0)>0)
     if [c['cell'] for c in r['cells']]!=[f'R{i}C{j}' for i in range(1,4) for j in range(1,4)]:raise ValueError('Unexpected grid')
     for k,c in enumerate(r['cells']):
      if c['state'] not in ('COHERENT SCENE FLOW','MIXED SCENE MOTION'):continue
      values=[c['vx'],c['vy'],c['coherence'],c['active_fraction']]
      if any(v is None or not math.isfinite(v) for v in values):raise ValueError('Invalid measured flow')
      d=b['cells'][k];d['n']+=1;d['vx']+=c['vx']/width;d['vy']+=c['vy']/height;d['coherence']+=c['coherence'];d['active']+=c['active_fraction'];d['mixed']+=int(c['state']=='MIXED SCENE MOTION')
   if expected!=count:raise ValueError('Flow row count mismatch')
   full_seconds=int(count/fps);series={}
   for sec in range(full_seconds):
    b=bins[sec];items=[]
    for k,c in enumerate(b['cells']):
     n=c['n'];items.append({'flow_vx':c['vx']/n if n else None,'flow_vy':c['vy']/n if n else None,'coherence':c['coherence']/n if n else None,'active_fraction':c['active']/n if n else None,'mixed_fraction':c['mixed']/n if n else None,'flow_valid_fraction':n/b['frames'] if b['frames'] else 0,'tracked_detections_mean':zone_counts[(sec,k)]/b['frames'] if b['frames'] else None,'frame_tracking_present_fraction':b['with_tracks']/b['frames'] if b['frames'] else 0})
    series[sec]=items
   source=meta['source'];parts=source.replace('\\','/').split('/')
   event=next((p for p in parts if p.startswith(('1_Times','2_Las','3_Love','4_Italy'))),'REVIEW_REQUIRED')
   windows=eligible=0
   for end in range(3,full_seconds):
    for k in range(9):
     history=[series[s][k] for s in range(end-3,end)];future=series[end][k]
     usable=all(h['flow_valid_fraction']>=.8 for h in history+[future])
     record={'source':folder,'event_group':event,'split':'UNASSIGNED','zone':f'R{k//3+1}C{k%3+1}','history_start_s':end-3,'forecast_origin_s':end,'target_end_s':end+1,'history':history,'target':{'vx':future['flow_vx'],'vy':future['flow_vy']},'target_valid_fraction':future['flow_valid_fraction'],'signal_coverage_pass':usable,'camera_review':'REQUIRED','training_approved':False}
     dest.write(json.dumps(record,allow_nan=False)+'\n');windows+=1;eligible+=int(usable)
   audits.append({'source':folder,'event_group':event,'frames':count,'seconds':count/fps,'trajectory_rows':rows,'frames_without_tracks':count-len(frame_counts),'mean_tracked_detections':rows/count,'zone_windows':windows,'coverage_pass_windows':eligible})
   total+=windows;eligible_total+=eligible
 audit={'runs':audits,'zone_windows':total,'coverage_pass_windows':eligible_total,'training_approved_windows':0,'note':'Coverage is not crowd-motion validity. Review camera motion and visibility; all windows are unapproved. Target uses only next-second flow; history excludes target values. Keep source events together in splits. Missing tracks are not zero people. Image-axis normalization does not calibrate physical speed.'}
 (out/'audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
 return audit
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',required=True);p.add_argument('--output',required=True);a=p.parse_args();print(json.dumps(prepare(a.archive,a.output),indent=2))
