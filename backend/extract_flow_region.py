"""Standalone recorded-video / confirmed ordered-frame optical-flow extraction."""
import argparse
import json
import math
import re
import time
from pathlib import Path
from collections import Counter
from crowd_signals import QualityReference
from flow_field import FlowField


def natural(path):return [int(x) if x.isdigit() else x.lower() for x in re.split(r'(\d+)',path.name)]


def run(args):
    import cv2
    import numpy as np
    source=Path(args.source);cap=None;writer=None;handle=None;frames=0;states=Counter()
    if args.width<64:raise ValueError('Analysis width must be at least 64')
    if source.is_dir():
        if not args.confirm_order or args.fps is None or not math.isfinite(args.fps) or args.fps<=0:
            raise ValueError('Frame folders require verified --fps and --confirm-order; do not guess timing')
        paths=sorted([p for p in source.iterdir() if p.suffix.lower() in {'.jpg','.jpeg','.png','.bmp'}],key=natural)
        if len(paths)<2:raise ValueError('Need at least two ordered frames')
        fps=args.fps;expected=len(paths)
        def read_frame(i):
            if i>=len(paths):return False,None
            image=cv2.imread(str(paths[i]))
            if image is None:raise ValueError('Unreadable image in sequence; refusing to skip time')
            return True,image
    else:
        cap=cv2.VideoCapture(str(source))
        if not cap.isOpened():raise ValueError('Cannot open recorded video')
        fps=cap.get(cv2.CAP_PROP_FPS);expected=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if not math.isfinite(fps) or fps<=0:
            cap.release();raise ValueError('No usable video FPS')
        def read_frame(i):return cap.read()
    if not math.isfinite(args.start) or args.start < 0:
        raise ValueError('Start time must be finite and nonnegative')
    if args.end is not None and (not math.isfinite(args.end) or args.end <= args.start):
        raise ValueError('End time must be finite and later than start')
    offset = math.ceil(args.start * fps)
    stop = math.ceil(args.end * fps) if args.end is not None else expected
    if expected <= 0 or stop > expected or stop - offset < 2:
        raise ValueError('Requested interval is outside reported video bounds')
    original_read = read_frame
    # Decode sequentially to retain exact frame-index mapping.
    for index in range(offset):
        ok, _ = original_read(index)
        if not ok:
            raise ValueError('Decode failed before requested start')
    def read_frame(i):
        return original_read(i + offset)
    expected = stop - offset
    roi = None
    original_dims = None
    out=Path(args.output)
    quality=QualityReference();engine=FlowField();prev=None;dims=None;status='failed';start=time.monotonic()
    try:
        out.mkdir(parents=True,exist_ok=False)
        handle=(out/'zone_flow.jsonl').open('w',encoding='utf-8')
        while True:
            if frames >= expected:
                status='complete';break
            ok,frame=read_frame(frames)
            if not ok:
                if frames<2 or (expected>0 and frames<expected):raise ValueError('Video ended before expected frames')
                status='complete';break
            full_h, full_w = frame.shape[:2]
            if original_dims is None:
                original_dims = [full_w, full_h]
            if original_dims != [full_w, full_h]:
                raise ValueError('Source frame dimensions changed')
            if roi is None:
                if args.select_roi:
                    selected = cv2.selectROI('Select crowd region; Enter accepts, Esc cancels', frame, False, False)
                    cv2.destroyAllWindows()
                    roi = [int(v) for v in selected]
                elif args.roi:
                    roi = args.roi
                else:
                    roi = [0, 0, full_w, full_h]
                x, y, rw, rh = roi
                if x < 0 or y < 0 or min(rw, rh) < 64 or x+rw > full_w or y+rh > full_h:
                    raise ValueError('ROI cancelled or outside image; minimum size is 64x64')
            x, y, rw, rh = roi
            frame = frame[y:y+rh, x:x+rw].copy()
            h,w=frame.shape[:2]
            if dims is None:dims=(h,w)
            if dims!=(h,w):raise ValueError('Frame dimensions changed within sequence')
            if min(h,w)<64:raise ValueError('Frame is too small')
            sw=min(w,args.width);sh=max(64,round(h*sw/w))
            gray=cv2.cvtColor(cv2.resize(frame,(sw,sh)),cv2.COLOR_BGR2GRAY)
            features=[]
            for row in np.array_split(gray,3,axis=0):
                for tile in np.array_split(row,3,axis=1):
                    features.append([float(tile.std()),float(cv2.Laplacian(tile,cv2.CV_64F).var()),float(np.mean((tile<8)|(tile>247)))])
            t=frames/fps;q,changed=quality.update(t,features);field=None
            if prev is not None and 1/fps<=.5:
                field=cv2.calcOpticalFlowFarneback(prev,gray,None,.5,3,15,3,5,1.2,0)
                field[:,:,0]*=w/sw*fps;field[:,:,1]*=h/sh*fps
            result=engine.update(t,field,w,h,quality.tile_states,[])
            handle.write(json.dumps({'frame':frames,'time_s':t,'source_frame':offset+frames,'source_time_s':(offset+frames)/fps,'roi_xywh':roi,'quality':q,'changed_tiles':changed,**result},allow_nan=False)+'\n')
            states.update(c['state'] for c in result['cells'])
            if args.overlay:
                if writer is None:
                    writer=cv2.VideoWriter(str(out/'flow_overlay.mp4'),cv2.VideoWriter_fourcc(*'mp4v'),fps,(w,h))
                    if not writer.isOpened():raise ValueError('Cannot create overlay video')
                for k,c in enumerate(result['cells']):
                    x,y=round((k%3+.5)*w/3),round((k//3+.5)*h/3)
                    cv2.putText(frame,c['cell']+' '+c['state'],(k%3*w//3+5,k//3*h//3+25),cv2.FONT_HERSHEY_SIMPLEX,.35,(0,200,255),1)
                for path in result['paths']:
                    pts=path['points']
                    for a,b in zip(pts,pts[1:]):cv2.line(frame,(round(a[1]),round(a[2])),(round(b[1]),round(b[2])),(255,220,0),2)
                writer.write(frame)
            prev=gray;frames+=1
    finally:
        if cap is not None:cap.release()
        if writer is not None:writer.release()
        if handle is not None:
            handle.close()
            (out/'summary.json').write_text(json.dumps({'status':status,'frames':frames,'fps':fps,
                'source':str(source.resolve()),'source_start_frame':offset,'source_stop_frame_exclusive':stop,'roi_xywh':roi,'source_dimensions_wh':original_dims,'coordinates':'ROI-local pixels; frame/time are segment-local. Use source_frame/source_time_s for original alignment.', 'review_status':'Manual ROI; camera stability and crowd-motion validity not automatically verified','wall_seconds':time.monotonic()-start,'tile_state_counts':dict(states),
                'time_basis':'frame index / FPS; constant frame interval assumption',
                'semantics':'Scene motion only. No crowd count, identity, trained surge prediction or automatic camera-motion rejection.'},indent=2))
    print(f'Processed {frames} frames. Results: {out}')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',required=True);p.add_argument('--output',required=True)
    p.add_argument('--fps',type=float);p.add_argument('--confirm-order',action='store_true')
    p.add_argument('--width',type=int,default=640);p.add_argument('--overlay',action='store_true')
    p.add_argument('--start', type=float, default=0., help='Source start in seconds')
    p.add_argument('--end', type=float, help='Exclusive source end in seconds')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--select-roi', action='store_true', help='Draw a crowd region on the first selected frame')
    group.add_argument('--roi', type=int, nargs=4, metavar=('X','Y','WIDTH','HEIGHT'))
    try:run(p.parse_args())
    except (ValueError,FileExistsError) as e:p.exit(2,f'Cannot continue: {e}\n')
