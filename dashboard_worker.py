"""Background video processor. No Streamlit calls from this thread."""
import csv
import json
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from crowd_signals import SignalMemory, QualityReference, infer
from crowd_forecast import CrowdForecast


class VideoWorker:
    def __init__(self, settings):
        self.settings = settings
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.latest = None
        self.status = 'Loading model'
        self.error = None
        self.heartbeat = time.monotonic()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def start(self):
        self.thread.start()

    def snapshot(self):
        self.heartbeat = time.monotonic()
        with self.lock:
            return self.latest, self.status, self.error

    def run(self):
        cap = None
        handle = None
        forecast_handle = None
        started = time.monotonic()
        frames = 0
        run_dir = None
        try:
            import cv2
            import numpy as np
            from ultralytics import YOLO
            s = self.settings
            model = YOLO(s['model'])
            if str(model.names.get(0, '')).lower() != s['target']:
                raise ValueError('Class 0 does not match the selected Head/Person target. Choose matching weights.')
            if s['live'] and isinstance(s['source'], str):
                cap = cv2.VideoCapture(s['source'], cv2.CAP_FFMPEG, [
                    cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000])
            else:
                cap = cv2.VideoCapture(s['source'])
            if not cap.isOpened():
                raise ValueError('Cannot open the selected source.')
            fps = cap.get(cv2.CAP_PROP_FPS)
            expected_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if not s['live'] else 0
            if not s['live'] and (not np.isfinite(fps) or fps <= 0):
                raise ValueError('The video has no usable frame rate.')
            run_dir = Path(s['output']) / datetime.now().strftime('dashboard_%Y%m%d_%H%M%S_%f')
            run_dir.mkdir(parents=True)
            handle = (run_dir/'signals.csv').open('w', newline='', encoding='utf-8')
            columns = ['frame','time_s','visible_detections','current_track_ids','remembered_tracks',
                       'quality','changed_tiles','flow_px_s','track_vx','track_vy','flow_vx','flow_vy','inference','processing_ms']
            log = csv.DictWriter(handle, fieldnames=columns)
            log.writeheader()
            forecast_handle = (run_dir/'concentration_forecasts.csv').open('w', newline='', encoding='utf-8')
            forecast_log = csv.DictWriter(forecast_handle, fieldnames=['frame','time_s','status','coverage',
                'cell','horizon_s','current_eligible','projected_tracks','change','slow_fraction','concentration_flag'])
            forecast_log.writeheader()
            forecaster = CrowdForecast(s.get('cell_threshold',10), s.get('slow_px_s',5))
            history = deque(maxlen=300)
            memory = SignalMemory(s['ttl'])
            quality_check = QualityReference(s['quality_ratio'],s['changed_tiles'])
            previous = None
            previous_time = None
            wall_start = time.monotonic()
            # Three seconds of processed observations establish only a relative reference.
            while not self.stop_event.is_set() and time.monotonic()-self.heartbeat < 45:
                begin = time.monotonic()
                ok, full = cap.read()
                if not ok:
                    self.status = 'Source disconnected' if s['live'] else ('Incomplete decode' if expected_frames > frames else 'Finished')
                    break
                t = time.monotonic()-wall_start if s['live'] else frames/fps
                h,w = full.shape[:2]
                l,top,r,b = s['roi']
                frame = full[int(top*h):max(int(b*h),int(top*h)+1),int(l*w):max(int(r*w),int(l*w)+1)].copy()
                rh,rw = frame.shape[:2]
                if min(rh,rw) < 64:
                    raise ValueError('Select a region at least 64 pixels wide and high.')
                small = cv2.resize(frame, (min(640,rw), max(64,round(rh*min(640,rw)/rw))))
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
                features = []
                for yy in np.array_split(gray,3,axis=0):
                    for tile in np.array_split(yy,3,axis=1):
                        features.append([float(tile.std()),float(cv2.Laplacian(tile,cv2.CV_64F).var()),
                                         float(np.mean((tile<8)|(tile>247)))])
                quality,changed = quality_check.update(t,features)
                flow_vector = None
                flow_speed = None
                if previous is not None and previous.shape == gray.shape and t > previous_time:
                    flow = cv2.calcOpticalFlowFarneback(previous,gray,None,.5,3,15,3,5,1.2,0)
                    flow[:,:,0] *= rw/gray.shape[1]/(t-previous_time)
                    flow[:,:,1] *= rh/gray.shape[0]/(t-previous_time)
                    magnitude = np.linalg.norm(flow,axis=2)
                    active = magnitude > 3
                    if active.mean() > .01:
                        flow_vector = tuple(float(x) for x in np.median(flow[active],axis=0))
                        flow_speed = float(np.median(magnitude[active]))
                previous,previous_time = gray,t
                result = model.track(frame,persist=True,tracker='botsort.yaml',classes=[0],
                    imgsz=s['imgsz'],conf=s['conf'],device=s['device'],verbose=False)[0]
                boxes = result.boxes
                observations = []
                count = len(boxes) if boxes is not None else 0
                if boxes is not None:
                    xyxy = boxes.xyxy.cpu().tolist()
                    ids = boxes.id.int().cpu().tolist() if boxes.id is not None else [None]*len(xyxy)
                    for tid,box in zip(ids,xyxy):
                        x1,y1,x2,y2 = box
                        cv2.rectangle(frame,(int(x1),int(y1)),(int(x2),int(y2)),(130,220,80) if quality=='REFERENCE-LIKE' else (80,170,255),1)
                        if tid is not None:
                            observations.append((tid,(x1+x2)/2,(y1+y2)/2 if s['target']=='head' else y2))
                ghosts,vector = memory.update(t,observations,quality=='REFERENCE-LIKE')
                for tid,x,y,age in ghosts:
                    cv2.circle(frame,(int(x),int(y)),4,(160,160,160),1)
                state,message = infer(quality,count,vector,flow_vector,s['count_threshold'])
                forecast = forecaster.update(t,observations,count,rw,rh,quality,state)
                for cell in forecast['cells'] or [{}]:
                    forecast_log.writerow(dict(frame=frames,time_s=round(t,3),status=forecast['status'],
                        coverage=forecast['coverage'],**cell))
                forecast_handle.flush()
                for i in (1,2):
                    cv2.line(frame,(rw*i//3,0),(rw*i//3,rh),(110,110,110),1)
                    cv2.line(frame,(0,rh*i//3),(rw,rh*i//3),(110,110,110),1)
                for k in range(9):
                    cv2.putText(frame,f'R{k//3+1}C{k%3+1}',(k%3*rw//3+8,k//3*rh//3+48),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1)
                cv2.putText(frame,f'{state} | visible: {count} | remembered: {len(ghosts)}',(10,25),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1)
                row = dict(frame=frames,time_s=round(t,3),visible_detections=count,current_track_ids=len(observations),
                    remembered_tracks=len(ghosts),quality=quality,changed_tiles=changed,
                    flow_px_s=flow_speed,track_vx=vector[0] if vector else None,track_vy=vector[1] if vector else None,
                    flow_vx=flow_vector[0] if flow_vector else None,flow_vy=flow_vector[1] if flow_vector else None,
                    inference=state,processing_ms=round((time.monotonic()-begin)*1000,2))
                log.writerow(row)
                handle.flush()
                history.append({k:row[k] for k in ['time_s','visible_detections','remembered_tracks']})
                ok,jpg = cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,80])
                with self.lock:
                    self.status = 'Running'
                    self.latest = {'received_at':time.monotonic(),'image':jpg.tobytes() if ok else None,'row':row,'message':message,
                        'history':list(history),'log':str(run_dir/'signals.csv'),'forecast':forecast,
                        'forecast_log':str(run_dir/'concentration_forecasts.csv')}
                frames += 1
                if not s['live'] and s['pace']:
                    self.stop_event.wait(max(0,frames/fps-(time.monotonic()-wall_start)))
            else:
                self.status = 'Stopped'
        except Exception as exc:
            # Avoid exposing source URLs, which may carry camera credentials.
            self.error = str(exc) if isinstance(exc,ValueError) else f'{type(exc).__name__}: processing failed. Check dependencies, weights and input.'
            self.status = 'Error'
        finally:
            if cap is not None:
                cap.release()
            if handle is not None:
                handle.close()
            if forecast_handle is not None:
                forecast_handle.close()
            if run_dir:
                (run_dir/'summary.json').write_text(json.dumps({'status':self.status,'frames_processed':frames,
                    'wall_seconds':time.monotonic()-started,'time_basis':'monotonic capture time' if self.settings['live'] else 'frame index / source FPS (CFR assumption)',
                    'settings':{k:v for k,v in self.settings.items() if k not in ['source','model']},
                    'limitations':'Relative image-quality heuristic; optical flow measures scene motion; counts are visible detections; no calibrated safety prediction.'},indent=2))
