"""Launch locally: python -m streamlit run dashboard_live.py"""
from pathlib import Path
import tempfile
import time
import pandas as pd
import streamlit as st
from dashboard_worker import VideoWorker

st.set_page_config(page_title='Event Horizon | Monitor', page_icon='◉', layout='wide')
st.markdown('''<style>
.stApp {background:#0d1422;color:#edf2f7}
[data-testid="stSidebar"] {background:#152033}
[data-testid="stMetric"] {background:#1a273c;padding:18px;border-radius:12px;border:1px solid #2d3b50}
h1 {letter-spacing:-1.5px} .block-container {padding-top:2rem}
</style>''', unsafe_allow_html=True)
st.title('Event Horizon')
st.caption('CROWD MONITOR • Selected-region observations and motion checks')
ROOT = Path(__file__).resolve().parent
worker = st.session_state.get('worker')
active = worker is not None and worker.thread.is_alive()

with st.sidebar:
    st.header('Source and region')
    mode = st.selectbox('Source', ['Local video','Upload video','Local webcam','RTSP camera'], disabled=active)
    uploaded = None
    if mode == 'Upload video':
        uploaded = st.file_uploader('Video',type=['mp4','avi','mov','mkv'],disabled=active)
        source = None
    elif mode == 'Local webcam':
        source = int(st.number_input('Camera index',0,10,0,disabled=active))
        st.caption('Uses the camera connected to the computer running this app.')
    elif mode == 'RTSP camera':
        source = st.text_input('RTSP URL',type='password',disabled=active)
    else:
        source = st.text_input('Video path','data/videos/sample.mp4',disabled=active)
    model_path = st.text_input('Model checkpoint','outputs/training/head_trial/weights/best.pt',disabled=active)
    target = st.selectbox('Checkpoint class 0',['head','person'],disabled=active)
    device = st.selectbox('Inference device',['0','cpu'],disabled=active)
    imgsz = st.select_slider('Input size',[640,960,1280],value=1280,disabled=active)
    conf = st.slider('Detection threshold',0.05,0.9,0.25,0.05,disabled=active)
    x = st.slider('Horizontal region (%)',0,100,(0,100),disabled=active)
    y = st.slider('Vertical region (%)',0,100,(0,100),disabled=active)
    st.caption('Coordinates start at the top-left. Only this cropped region is analysed.')
    with st.expander('Observation settings'):
        threshold = st.number_input('Visible-detection alert threshold',min_value=1,value=150,disabled=active)
        ttl = st.slider('Remember last position (seconds)',0.0,5.0,2.0,0.5,disabled=active)
        ratio = st.slider('Quality loss sensitivity',0.1,0.8,0.3,0.05,disabled=active)
        changed = st.slider('Changed tiles needed for warning',1,9,2,disabled=active)
        pace = st.checkbox('Pace file playback to source time',value=True,disabled=active)
    with st.expander('Concentration forecast'):
        cell_threshold = st.number_input('Projected tracks per cell: review threshold',min_value=1,value=10,disabled=active)
        slow_px_s = st.number_input('Observed slow motion threshold (px/s)',min_value=0.,value=5.,disabled=active)
        st.caption('Illustrative thresholds in image space. Tune for the selected camera; they are not crowd safety limits.')
    st.caption('Start with a clear view for 3 seconds. Restart after repositioning the camera.')
    start = st.button('Start monitoring',type='primary',disabled=active,use_container_width=True)
    if st.button('Stop monitoring',disabled=not active,use_container_width=True):
        worker.stop_event.set()
        st.info('Stopping after the current frame…')

if start:
    try:
        if x[0] >= x[1] or y[0] >= y[1]:
            raise ValueError('Choose a nonempty region.')
        weights = Path(model_path).expanduser()
        if not weights.is_absolute():
            weights = ROOT/weights
        if not weights.is_file():
            raise ValueError('Checkpoint not found. Enter the path to your trained best.pt.')
        temp_source = st.session_state.pop('temp_source',None)
        if temp_source:
            Path(temp_source).unlink(missing_ok=True)
        if mode == 'Upload video':
            if uploaded is None:
                raise ValueError('Upload a video first.')
            with tempfile.NamedTemporaryFile(suffix=Path(uploaded.name).suffix,delete=False) as tmp:
                tmp.write(uploaded.getbuffer())
                source = tmp.name
            st.session_state.temp_source = source
        elif mode == 'Local video':
            path = Path(source).expanduser()
            if not path.is_absolute():
                path = ROOT/path
            if not path.is_file():
                raise ValueError('Video not found. Enter an existing local file path.')
            source = str(path)
        elif mode == 'RTSP camera' and not source.lower().startswith(('rtsp://','rtsps://')):
            raise ValueError('Enter an RTSP camera URL.')
        settings = dict(source=source,model=str(weights),target=target,device=device,imgsz=imgsz,conf=conf,
            roi=[x[0]/100,y[0]/100,x[1]/100,y[1]/100],ttl=ttl,quality_ratio=ratio,changed_tiles=changed,
            count_threshold=threshold,cell_threshold=cell_threshold,slow_px_s=slow_px_s,
            live=mode in ['Local webcam','RTSP camera'],pace=pace,
            output=str(ROOT/'outputs'/'dashboard_runs'))
        st.session_state.worker = VideoWorker(settings)
        st.session_state.worker.start()
        st.rerun()
    except ValueError as exc:
        st.error(str(exc))


@st.fragment(run_every=0.4)
def monitor():
    worker = st.session_state.get('worker')
    if worker is None:
        st.info('Choose a video and checkpoint, then start monitoring.')
        st.markdown('**This build:** detections, two motion signals, visibility checks, and 1–3 second concentration projections.')
        return
    sample,status,error = worker.snapshot()
    st.caption(f'Session: {status}')
    if error:
        st.error(error)
    if sample is None:
        st.info(status)
        if not worker.thread.is_alive() and st.button('Reset session'):
            st.session_state.pop('worker',None)
            temp_source = st.session_state.pop('temp_source',None)
            if temp_source:
                Path(temp_source).unlink(missing_ok=True)
            st.rerun()
        return
    row = sample['row']
    if status != 'Running':
        st.warning('Session ended. The display below is the last recorded observation.')
    elif time.monotonic()-sample['received_at'] > 2:
        st.warning('No fresh observation for over two seconds. Displayed counts are stale; check the source or processing status.')
    elif row['quality'] != 'REFERENCE-LIKE':
        st.warning(f"{row['inference']}: {sample['message']}")
    else:
        st.info(f"{row['inference']}: {sample['message']}")
    cards = st.columns(4)
    cards[0].metric('Visible detections',row['visible_detections'])
    cards[1].metric('IDs in this frame',row['current_track_ids'])
    cards[2].metric('Remembered only',row['remembered_tracks'])
    cards[3].metric('Changed image tiles',f"{row['changed_tiles']} / 9")
    left,right = st.columns([2.3,1])
    with left:
        if sample['image']:
            st.image(sample['image'],use_container_width=True)
        st.caption('Grey circles: last reliable positions, never added to the current count. No identity recovery or motion behind obstructions is verified.')
    with right:
        st.subheader('Two motion signals')
        for title,kx,ky in [('Track motion','track_vx','track_vy'),('Scene optical flow','flow_vx','flow_vy')]:
            value = 'Waiting for signal' if row[kx] is None else f"x {row[kx]:.1f}, y {row[ky]:.1f} px/s"
            st.markdown(f'**{title}**')
            st.write(value)
        st.caption('Positive x: right. Positive y: down. Scene flow includes spray and camera movement; it cannot count people.')
        st.metric('Frame processing time',f"{row['processing_ms']:.0f} ms")
        st.caption('Excludes browser delivery and camera buffering; live end-to-end latency is unverified.')
        st.write(f"Video time: {row['time_s']:.1f} s · frame {row['frame']}")
    history = pd.DataFrame(sample['history']).set_index('time_s')
    st.line_chart(history,height=200)
    st.subheader('Crowd concentration outlook · 1–3 seconds')
    forecast = sample['forecast']
    fresh = status == 'Running' and time.monotonic()-sample['received_at'] <= 2
    st.caption(f"Eligible continuous tracks: {forecast['coverage']:.0%} of current detections. This is track coverage, not confidence or detector recall.")
    if not fresh:
        st.info('Live forecasts suspended: session ended or observation is stale. The saved log contains historical projections.')
    elif not forecast['cells']:
        st.warning(f"Forecast unavailable: {forecast['reason']}")
    else:
        if forecast['status'] == 'REVIEW CONCENTRATION':
            st.warning(forecast['advice'])
        else:
            st.info(forecast['advice'])
        horizon = st.select_slider('Look ahead (seconds)',[1,2,3],value=1,key='forecast_horizon')
        cells = [c for c in forecast['cells'] if c['horizon_s'] == horizon]
        for r in range(3):
            cards = st.columns(3)
            for c in range(3):
                item = cells[r*3+c]
                cards[c].metric(item['cell'] + (' · REVIEW' if item['concentration_flag'] else ''),
                    f"{item['projected_tracks']} tracks",f"{item['change']:+d} from now",delta_color='inverse')
        st.dataframe(pd.DataFrame(cells)[['cell','current_eligible','projected_tracks','change','slow_fraction']],hide_index=True)
        st.caption('Slow fraction describes current eligible tracks. Projected counts exclude exits and cannot predict unseen arrivals, hidden people, sudden stops, or interactions. Equal image cells represent unequal ground areas under perspective.')
    if not worker.thread.is_alive():
        st.download_button('Download observation log',Path(sample['log']).read_bytes(),'signals.csv','text/csv')
        st.download_button('Download concentration forecasts',Path(sample['forecast_log']).read_bytes(),'concentration_forecasts.csv','text/csv')
        if st.button('Prepare another run'):
            st.session_state.pop('worker',None)
            temp_source = st.session_state.pop('temp_source',None)
            if temp_source:
                Path(temp_source).unlink(missing_ok=True)
            st.rerun()


monitor()
st.divider()
st.caption('Prototype observations: no verified total site population, calibrated metres, or validated safety prediction. A reference-like image can still contain blind spots.')
