"""Event Horizon: recorded-video tracking and zone analytics. Run --help for options."""
import argparse
import csv
import json
import math
import time
from collections import deque
from datetime import datetime
from pathlib import Path


def motion(history):
    if len(history) < 2:
        return None, 'unknown'
    t0, x0, y0 = history[0]
    t1, x1, y1 = history[-1]
    dt = t1 - t0
    if dt <= 0:
        return None, 'unknown'
    dx, dy = x1-x0, y1-y0
    speed = math.hypot(dx, dy)/dt
    direction = ('right' if dx >= 0 else 'left') if abs(dx) >= abs(dy) else ('down' if dy >= 0 else 'up')
    return speed, direction


def validate_zones(zones):
    names = set()
    for z in zones:
        if not isinstance(z.get('name'), str) or not z['name'] or z['name'] in names:
            raise ValueError('Zone names must be nonempty and unique.')
        names.add(z['name'])
        p = z.get('polygon', [])
        if len(p) < 3 or any(len(v)!=2 or any(not isinstance(a,(int,float)) or not math.isfinite(a) or not 0<=a<=1 for a in v) for v in p):
            raise ValueError('Each zone needs at least three normalized [x,y] vertices in [0,1].')
    if not zones:
        raise ValueError('At least one zone is required.')
    return zones


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', default='data/videos/sample.mp4')
    p.add_argument('--model', default='outputs/training/head_trial/weights/best.pt')
    p.add_argument('--target', choices=['head','person'], default='head')
    p.add_argument('--imgsz', type=int, default=1280)
    p.add_argument('--conf', type=float, default=.25)
    p.add_argument('--device', default='0')
    p.add_argument('--zones', help='JSON zone file with normalized polygon vertices')
    p.add_argument('--select-zones', action='store_true', help='Draw polygons on the first frame')
    p.add_argument('--show', action='store_true')
    p.add_argument('--output', default='outputs')
    p.add_argument('--alert-count', type=int, default=50)
    p.add_argument('--alert-seconds', type=float, default=3)
    p.add_argument('--stop-speed', type=float, default=5, help='Image pixels/second, not physical speed')
    args = p.parse_args()
    if args.imgsz<=0 or not 0<=args.conf<=1 or args.alert_count<=0 or args.alert_seconds<0 or args.stop_speed<0:
        p.error('Invalid numeric setting')
    if args.zones and args.select_zones:
        p.error('Use either --zones or --select-zones')
    import cv2
    import numpy as np
    from ultralytics import YOLO
    source = Path(args.source).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    cap = cv2.VideoCapture(str(source))
    writer = None
    run = None
    status = 'failed'
    frames = rows = 0
    elapsed = 0
    times = []
    metadata = vars(args).copy()
    try:
        ok, frame = cap.read()
        fps = cap.get(cv2.CAP_PROP_FPS)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if not ok or not math.isfinite(fps) or fps <= 0:
            raise RuntimeError('Unreadable video or invalid FPS')
        h,w = frame.shape[:2]
        zones = json.loads(Path(args.zones).read_text()) if args.zones else [{'name':'Full view','polygon':[[0,0],[1,0],[1,1],[0,1]]}]
        if args.select_zones:
            zones, points = [], []
            scale = min(1, 1200/w, 750/h)
            sw,sh = round(w*scale),round(h*scale)
            def click(event,x,y,flags,param):
                if event == cv2.EVENT_LBUTTONDOWN:
                    points.append([min(1,max(0,x/sw)),min(1,max(0,y/sh))])
            cv2.namedWindow('Select zones')
            cv2.setMouseCallback('Select zones',click)
            print('Click polygon vertices. N saves zone; U undoes vertex; ENTER finishes; ESC cancels.')
            while True:
                preview=cv2.resize(frame,(sw,sh))
                for z in zones:
                    cv2.polylines(preview,[np.array([[round(x*sw),round(y*sh)] for x,y in z['polygon']],np.int32)],True,(0,255,0),2)
                if points:
                    cv2.polylines(preview,[np.array([[round(x*sw),round(y*sh)] for x,y in points],np.int32)],False,(0,255,255),2)
                cv2.imshow('Select zones',preview)
                key=cv2.waitKey(30)&255
                if key==27:
                    raise RuntimeError('Zone selection cancelled')
                if key==ord('u') and points:
                    points.pop()
                if key==ord('n') and len(points)>=3:
                    zones.append({'name':f'Zone {len(zones)+1}','polygon':points[:]});points.clear()
                if key in (10,13):
                    if len(points)>=3:
                        zones.append({'name':f'Zone {len(zones)+1}','polygon':points[:]})
                    if zones:
                        break
            cv2.destroyWindow('Select zones')
        validate_zones(zones)
        polygons=[np.array([[x*(w-1),y*(h-1)] for x,y in z['polygon']],np.float32) for z in zones]
        model=YOLO(args.model)
        if str(model.names[0]).lower()!=args.target:
            raise ValueError(f'Class 0 is {model.names[0]!r}, but --target is {args.target!r}. Choose matching weights and target.')
        run=Path(args.output).resolve()/datetime.now().strftime('analytics_%Y%m%d_%H%M%S_%f')
        run.mkdir(parents=True)
        (run/'zones.json').write_text(json.dumps(zones,indent=2))
        writer=cv2.VideoWriter(str(run/'tracked_video.mp4'),cv2.VideoWriter_fourcc(*'mp4v'),fps,(w,h))
        if not writer.isOpened():
            raise RuntimeError('Cannot create output video')
        metadata.update(source=str(source),source_fps=fps,reported_frames=total,width=w,height=h,tracker='botsort.yaml',time_basis='frame index/source FPS, CFR approximation',speed_units='image pixels/second',count_semantics='current tracked detections, not verified occupancy or unique visitors',alert_semantics='configurable sustained-count heuristic, not validated safety prediction')
        histories={};above=[None]*len(zones)
        with (run/'trajectories.csv').open('w',newline='') as tf,(run/'zone_metrics.csv').open('w',newline='') as zf:
            tracks=csv.writer(tf);metrics=csv.writer(zf)
            tracks.writerow(['frame','time_s','track_id','confidence','x1','y1','x2','y2','anchor_x','anchor_y','speed_px_s','direction'])
            metrics.writerow(['frame','time_s','zone','tracked_count_estimate','mean_speed_px_s','dominant_direction','buildup_alert','processing_ms'])
            while ok:
                start=time.perf_counter()
                if frame.shape[:2]!=(h,w):
                    raise RuntimeError('Frame size changed')
                t=frames/fps
                result=model.track(frame,persist=True,tracker='botsort.yaml',classes=[0],device=args.device,imgsz=args.imgsz,conf=args.conf,verbose=False)[0]
                canvas=result.plot(labels=False)
                current=set();members=[[] for _ in zones]
                boxes=result.boxes
                if boxes is not None and boxes.id is not None:
                    for tid,box,score in zip(boxes.id.int().cpu().tolist(),boxes.xyxy.cpu().tolist(),boxes.conf.cpu().tolist()):
                        x1,y1,x2,y2=box;x=(x1+x2)/2;y=(y1+y2)/2 if args.target=='head' else y2
                        current.add(tid)
                        hist=histories.setdefault(tid,deque())
                        hist.append((t,x,y))
                        while len(hist)>2 and t-hist[0][0]>1:
                            hist.popleft()
                        speed,direction=motion(hist)
                        if speed is not None and speed<args.stop_speed:
                            direction='stationary'
                        if len(hist)>1:
                            cv2.polylines(canvas,[np.array([[int(a),int(b)] for _,a,b in hist],np.int32)],False,(0,255,255),1)
                        cv2.putText(canvas,str(tid),(int(x),int(y)),cv2.FONT_HERSHEY_SIMPLEX,.35,(255,255,255),1)
                        tracks.writerow([frames,round(t,4),tid,score,*box,x,y,'' if speed is None else speed,direction]);rows+=1
                        for j,polygon in enumerate(polygons):
                            if cv2.pointPolygonTest(polygon,(float(x),float(y)),False)>=0:
                                members[j].append((speed,direction))
                histories={k:v for k,v in histories.items() if k in current}
                zone_rows=[]
                for j,z in enumerate(zones):
                    count=len(members[j])
                    above[j]=(t if above[j] is None else above[j]) if count>=args.alert_count else None
                    alert=above[j] is not None and t-above[j]>=args.alert_seconds
                    speeds=[s for s,d in members[j] if s is not None]
                    directions=[d for s,d in members[j] if s is not None]
                    direction=max(set(directions),key=directions.count) if directions else 'unknown'
                    zone_rows.append([frames,round(t,4),z['name'],count,sum(speeds)/len(speeds) if speeds else '',direction,int(alert)])
                    color=(0,0,255) if alert else (0,255,0)
                    cv2.polylines(canvas,[polygons[j].astype(np.int32)],True,color,2)
                    cv2.putText(canvas,f"{z['name']}: {count} tracked | {direction}"+(' | BUILDUP' if alert else ''),(10,55+25*j),cv2.FONT_HERSHEY_SIMPLEX,.55,color,2)
                rate=frames/elapsed if elapsed else 0
                cv2.putText(canvas,f'Estimated tracked count: {len(current)} | measured processing FPS: {rate:.1f}',(10,25),cv2.FONT_HERSHEY_SIMPLEX,.55,(255,255,255),2)
                writer.write(canvas)
                quit_requested=False
                if args.show:
                    cv2.imshow('Event Horizon',cv2.resize(canvas,(min(w,1280),round(h*min(w,1280)/w))))
                    quit_requested=cv2.waitKey(1)&255 in (27,ord('q'))
                frames+=1
                if not quit_requested:
                    ok,frame=cap.read()
                duration=time.perf_counter()-start
                elapsed+=duration;times.append(duration)
                for row in zone_rows:
                    metrics.writerow(row+[round(duration*1000,3)])
                if frames%50==0:
                    print(f'{frames} frames; {rows} observations; {frames/elapsed:.1f} processing FPS')
                if quit_requested:
                    status='stopped_by_user';break
            else:
                status='completed' if total<=0 or frames>=total else 'incomplete'
    finally:
        cap.release()
        if writer is not None:
            writer.release()
        cv2.destroyAllWindows()
        if run is not None:
            metadata.update(status=status,frames_processed=frames,trajectory_rows=rows,processing_fps=frames/elapsed if elapsed else None,processing_time_s=elapsed,mean_processing_ms=1000*elapsed/frames if frames else None,p95_processing_ms=float(np.percentile(times,95)*1000) if times else None,performance_scope='Includes tracking, overlays, video write, optional display and next-frame read; excludes setup, initial read, final codec flush and final metrics write. File throughput is not camera-to-display latency; no live capture or dropped-frame measurement.')
            (run/'run_summary.json').write_text(json.dumps(metadata,indent=2))
    print(f'Status: {status}. Outputs: {run}')
    if status=='incomplete':
        raise RuntimeError('Video decoding ended before its reported frame count')


if __name__=='__main__':
    main()
