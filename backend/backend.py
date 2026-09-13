"""Event Horizon backend CLI. Run commands with --help. No dashboard required."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
from collections import Counter, defaultdict
from trajectory_features import prepare

CLASSES = ['free_flow','congested','surge']
FEATURES = ['mean_visible_tracks','count_change_per_s','median_frame_speed_px_s',
            'slow_fraction_px_threshold','direction_coherence','track_continuity']


def write_json(path, data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,indent=2,allow_nan=False),encoding='utf-8')


def read_json(path): return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def records(path):
    return [json.loads(s) for s in Path(path).read_text(encoding='utf-8-sig').splitlines() if s.strip()]


def scan(root, output):
    root=Path(root).resolve()
    if not root.is_dir():raise ValueError('Dataset root must be an existing directory')
    folders=defaultdict(list);videos=[];sidecars=[]
    for p in sorted(root.rglob('*')):
        if not p.is_file():continue
        if p.suffix.lower() in {'.jpg','.jpeg','.png','.bmp'}:folders[p.parent].append(p)
        elif p.suffix.lower() in {'.mp4','.avi','.mov','.mkv'}:videos.append(str(p.relative_to(root)))
        elif p.suffix.lower() in {'.txt','.csv','.json','.xml','.mat','.md'}:sidecars.append(str(p.relative_to(root)))
    report={'root':str(root),'video_files':videos,'possible_frame_folders':[
        {'folder':str(d.relative_to(root)),'images':len(ps),'filename_examples':[p.name for p in ps[:6]],
         'sequence_order_verified':False,'frame_interval_s':None} for d,ps in folders.items()],
        'possible_annotation_files':sidecars,
        'next_step':'Verify scene grouping, natural frame order, original timing and label semantics. Folder names are not event labels.'}
    write_json(output,report)
    return {'videos':len(videos),'image_folders':len(folders),'report':str(output)}


def check_labels(labels):
    intervals=labels.get('intervals',[])
    previous_end=-float('inf')
    for r in intervals:
        a,b=r['start_s'],r['end_s']
        if not all(isinstance(x,(int,float)) and math.isfinite(x) for x in [a,b]) or not 0<=a<b:
            raise ValueError('Invalid annotation interval')
        if a<previous_end:raise ValueError('Annotations must be sorted and must not overlap')
        if r['state'] not in CLASSES+['unknown']:raise ValueError('Unknown event state')
        if r['visibility'] not in ['clear','obscured','unreviewed']:raise ValueError('Unknown visibility')
        previous_end=b
    return intervals


def interval_at(intervals,t):
    return next((r for r in intervals if r['start_s']<=t<r['end_s']),None)


def history_clear(intervals,start,end):
    cursor=start
    for r in intervals:
        if r['end_s']<=cursor:continue
        if r['start_s']>cursor or r['visibility']!='clear' or not r.get('reviewer','').strip():return False
        cursor=r['end_s']
        if cursor>=end:
            endpoint=interval_at(intervals,end)
            return bool(endpoint and endpoint['visibility']=='clear' and endpoint.get('reviewer','').strip())
    return False


def label_data(features, label_path, output):
    samples=records(features);labels=read_json(label_path)
    if labels.get('source_video','').startswith('CONFIRM') or not labels.get('source_video'):
        raise ValueError('Confirm matching source_video in annotations before labelling')
    intervals=check_labels(labels);reason=Counter();joined=[]
    for s in samples:
        if s['video_id']!=labels['video_id'] or s['zone']!=labels.get('zone'):
            raise ValueError('Feature/label video ID or zone mismatch')
        target=interval_at(intervals,s['target_time_s'])
        current=interval_at(intervals,s['history_end_s'])
        why=None
        if not history_clear(intervals,s['history_start_s'],s['history_end_s']):why='history_visibility_unverified'
        elif not target or target['state']=='unknown' or target['visibility']!='clear' or not target.get('reviewer','').strip():why='future_label_unknown'
        elif s['features']['track_continuity']<.6 or s['features']['median_frame_speed_px_s'] is None:why='insufficient_track_continuity'
        if why:reason[why]+=1;continue
        s['label']=target['state'];s['current_state']=current['state'] if current else 'unknown'
        joined.append(s)
    out=Path(output);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(''.join(json.dumps(s,allow_nan=False)+'\n' for s in joined))
    summary={'candidates':len(samples),'labelled':len(joined),'excluded':dict(reason),
             'classes':dict(Counter(s['label'] for s in joined))}
    write_json(out.with_suffix('.summary.json'),summary)
    return summary


def load_training(manifest_path):
    manifest=read_json(manifest_path);base=Path(manifest_path).resolve().parent
    if manifest.get('grouping_reviewed') is not True:raise ValueError('Review source event grouping and set grouping_reviewed=true')
    grouped={};hash_splits={};seen_ids=set();sets={'train':[],'validation':[],'test':[]}
    specs=set();sources=[]
    for r in manifest['recordings']:
        rid=r['video_id'];group=r['event_group'];split=r['split']
        if rid in seen_ids:raise ValueError('Duplicate video ID in manifest')
        seen_ids.add(rid)
        if split not in sets or not group:raise ValueError('Explicit train/validation/test split and event_group required')
        if group in grouped and grouped[group]!=split:raise ValueError('Same event crosses data splits')
        grouped[group]=split
        audit=read_json(base/r['audit']);digest=audit['source_sha256']
        if digest in hash_splits:raise ValueError('Duplicate trajectory source in manifest')
        hash_splits[digest]=split
        if audit['video_id']!=rid:raise ValueError('Audit video ID mismatch')
        specs.add((audit['window_s'],audit['horizon_s'],audit['stride_s']))
        samples=records(base/r['labelled_features'])
        if not samples:raise ValueError('Recording has no usable reviewed training windows')
        for s in samples:
            if s['video_id']!=rid or s['zone']!='Full view' or s['label'] not in CLASSES:
                raise ValueError('Invalid labelled sample or unsupported zone')
            if abs(s['target_time_s']-s['history_end_s']-audit['horizon_s'])>1e-3:
                raise ValueError('Target horizon does not match metadata')
        sets[split].extend(samples);sources.append({'video_id':rid,'event_group':group,'split':split,'sha256':digest})
    if len(specs)!=1:raise ValueError('All recordings must use the same feature timing settings')
    if any(not v for v in sets.values()):raise ValueError('Independent labelled train, validation and test recordings are required')
    train_classes=set(s['label'] for s in sets['train'])
    if len(train_classes)<2:raise ValueError('Training requires at least two reviewed event classes')
    if any(set(s['label'] for s in values)!=train_classes for values in sets.values()):
        raise ValueError('Each split must represent every class being evaluated')
    return sets,sources,next(iter(specs))


def matrix(samples):
    return [[float('nan') if s['features'].get(k) is None else float(s['features'][k]) for k in FEATURES] for s in samples]


def train(manifest, output):
    from sklearn.pipeline import make_pipeline
    from sklearn.impute import SimpleImputer
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import classification_report, confusion_matrix
    import sklearn,joblib
    sets,sources,spec=load_training(manifest)
    model=make_pipeline(SimpleImputer(strategy='median',add_indicator=True),
        RandomForestClassifier(n_estimators=200,max_depth=6,min_samples_leaf=3,class_weight='balanced',random_state=42,n_jobs=-1))
    model.fit(matrix(sets['train']),[s['label'] for s in sets['train']])
    labels=list(model.classes_);report={}
    for name in ['validation','test']:
        data=sets[name];y=[s['label'] for s in data];pred=model.predict(matrix(data))
        current=[s['current_state'] for s in data]
        reviewed=[i for i,c in enumerate(current) if c in labels]
        onset=[i for i,c in enumerate(current) if c=='free_flow']
        report[name]={'windows':len(data),'class_counts':dict(Counter(y)),
            'classification':classification_report(y,pred,labels=labels,output_dict=True,zero_division=0),
            'confusion_matrix':confusion_matrix(y,pred,labels=labels).tolist(),
            'persistence_baseline':classification_report([y[i] for i in reviewed],[current[i] for i in reviewed],labels=labels,output_dict=True,zero_division=0) if reviewed else None,
            'currently_free_flow_subset':classification_report([y[i] for i in onset],[pred[i] for i in onset],labels=labels,output_dict=True,zero_division=0) if onset else None}
    out=Path(output);out.mkdir(parents=True,exist_ok=False)
    package={'model':model,'features':FEATURES,'window_s':spec[0],'horizon_s':spec[1],
             'stride_s':spec[2],'classes':labels,'sklearn_version':sklearn.__version__}
    joblib.dump(package,out/'model.joblib')
    write_json(out/'evaluation.json',{'classes':labels,'sources':sources,'results':report,
        'limitations':['Correlated windows; these metrics do not establish independent event accuracy.',
            'Model scores are uncalibrated. No crowd pressure or physical density is inferred.',
            'Full-view trajectory-only baseline. Optical-flow fusion is not yet trained.',
            'No surge capability is claimed unless surge is represented and evaluated.',
            'Retuning using this test set requires a new untouched evaluation set.']})
    return {'status':'trained','model':str(out/'model.joblib'),'evaluation':str(out/'evaluation.json'),'classes':labels}


def predict(model_path,features,visibility,output):
    import joblib
    package=joblib.load(model_path);model=package['model'];data=records(features)
    labels=read_json(visibility);intervals=check_labels(labels);predictions=[]
    for s in data:
        if labels['video_id']!=s['video_id'] or labels['zone']!=s['zone']:raise ValueError('Visibility metadata does not match recording/zone')
        if abs(s['history_end_s']-s['history_start_s']-package['window_s'])>1e-3 or abs(s['target_time_s']-s['history_end_s']-package['horizon_s'])>1e-3:
            raise ValueError('Feature timing does not match model')
        row={'time_s':s['history_end_s'],'target_time_s':s['target_time_s'],'state':'UNKNOWN','class_scores':None}
        if history_clear(intervals,s['history_start_s'],s['history_end_s']) and s['features']['track_continuity']>=.6 and s['features']['median_frame_speed_px_s'] is not None:
            scores=model.predict_proba(matrix([s]))[0]
            row.update(state=str(model.classes_[scores.argmax()]),class_scores={str(k):float(v) for k,v in zip(model.classes_,scores)})
        predictions.append(row)
    out=Path(output);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(''.join(json.dumps(r)+'\n' for r in predictions))
    return {'predictions':len(predictions),'output':str(out),'score_semantics':'Uncalibrated classifier scores, not verified risk probabilities'}


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    a=sub.add_parser('scan');a.add_argument('--root',required=True);a.add_argument('--output',required=True)
    a=sub.add_parser('prepare');a.add_argument('--trajectories',required=True);a.add_argument('--video-id',required=True);a.add_argument('--output',required=True)
    a.add_argument('--window',type=float,default=3.);a.add_argument('--horizon',type=float,default=2.)
    a=sub.add_parser('label');a.add_argument('--features',required=True);a.add_argument('--labels',required=True);a.add_argument('--output',required=True)
    a=sub.add_parser('train');a.add_argument('--manifest',required=True);a.add_argument('--output',required=True)
    a=sub.add_parser('predict');a.add_argument('--model',required=True);a.add_argument('--features',required=True);a.add_argument('--visibility',required=True);a.add_argument('--output',required=True)
    args=p.parse_args()
    try:
        if args.command=='scan':result=scan(args.root,args.output)
        elif args.command=='prepare':result=prepare(args.trajectories,args.video_id,args.output,args.window,args.horizon)
        elif args.command=='label':result=label_data(args.features,args.labels,args.output)
        elif args.command=='train':result=train(args.manifest,args.output)
        else:result=predict(args.model,args.features,args.visibility,args.output)
        print(json.dumps(result,indent=2))
    except (ValueError,FileNotFoundError,KeyError) as e:p.exit(2,f'Cannot continue: {e}\n')

if __name__=='__main__':main()
