"""Fixed-configuration same-scene diagnostic. Not approved for operational use."""
import argparse,json
from pathlib import Path
import numpy as np
import joblib
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge

FEATURES=['flow_vx','flow_vy','valid_fraction','track_vx','track_vy','track_support_fraction','mean_tracked_detections']
def vector(row):
    values=[]
    for step in row['history']:
        for key in FEATURES:
            value=step[key]
            # Missing motion has an explicit mask; zero fill is not a crowd count.
            values.extend([0. if value is None else float(value),float(value is not None)])
    return values

def evaluate(rows,prediction):
    y=np.asarray([r['target'] for r in rows]);base=np.asarray([r['persistence_prediction'] for r in rows])
    result={}
    for name,mask in [('all',np.ones(len(rows),dtype=bool)),('top_row',np.array([r['cell'].startswith('R1') for r in rows])),('middle_and_bottom',np.array([not r['cell'].startswith('R1') for r in rows]))]:
        if not mask.any():continue
        model=float(np.linalg.norm(prediction[mask]-y[mask],axis=1).mean())
        persistence=float(np.linalg.norm(base[mask]-y[mask],axis=1).mean())
        result[name]={'windows':int(mask.sum()),'model_mean_vector_error':model,'persistence_mean_vector_error':persistence,'relative_error_reduction':1-model/persistence if persistence else None}
    return result

def run(windows,output):
    rows=[json.loads(s) for s in Path(windows).read_text().splitlines() if s.strip()]
    # Predeclared diagnostic split: train targets end <=24; test histories start >=25.
    train=[r for r in rows if r['forecast_origin_s']<=23]
    test=[r for r in rows if r['forecast_origin_s']>=28]
    if len(train)<10 or len(test)<10:raise ValueError('Too few windows for fixed split')
    assert max(r['forecast_origin_s']+1 for r in train)<=min(r['forecast_origin_s']-3 for r in test)
    X=np.asarray([vector(r) for r in train]);y=np.asarray([r['target'] for r in train]);baseline=np.asarray([r['persistence_prediction'] for r in train])
    # Predict a correction to persistence; scaling is fitted on training only.
    model=make_pipeline(StandardScaler(),Ridge(alpha=10.0))
    model.fit(X,y-baseline)
    Xtest=np.asarray([vector(r) for r in test]);btest=np.asarray([r['persistence_prediction'] for r in test])
    prediction=btest+model.predict(Xtest)
    metrics=evaluate(test,prediction)
    out=Path(output);out.mkdir(parents=True,exist_ok=True)
    report={'experiment':'same-scene residual Ridge, alpha=10 fixed; no test-set tuning','train_windows':len(train),'test_windows':len(test),'excluded_gap_windows':len(rows)-len(train)-len(test),'train_forecast_origins_s':[min(r['forecast_origin_s'] for r in train),max(r['forecast_origin_s'] for r in train)],'test_forecast_origins_s':[min(r['forecast_origin_s'] for r in test),max(r['forecast_origin_s'] for r in test)],'metrics':metrics,'deployment_approved':False,'limitations':['Single manually cropped Times Square view; not an independent event test.','Overlapping windows/zones are correlated. No confidence interval or accuracy claim.','Optical-flow future targets are provisional scene-motion measurements, not ground truth.','Camera/ROI validity remains provisional. This diagnostic does not approve training windows.','No congestion classifier, surge probability, live integration or operational SOP activation.']}
    joblib.dump({'model':model,'feature_keys':FEATURES,'history_seconds':3,'target_seconds':1,'prediction':'last history flow vector + model correction','coordinates':'ROI width/height normalized velocities per second','deployment_approved':False},out/'experimental_flow_model.joblib')
    (out/'evaluation.json').write_text(json.dumps(report,indent=2))
    results=[{'cell':r['cell'],'forecast_origin_s':r['forecast_origin_s'],'target':r['target'],'persistence_prediction':r['persistence_prediction'],'model_prediction':p.tolist()} for r,p in zip(test,prediction)]
    (out/'test_predictions.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in results))
    # Serialization must preserve predictions exactly to numerical precision.
    loaded=joblib.load(out/'experimental_flow_model.joblib')
    np.testing.assert_allclose(loaded['model'].predict(Xtest),prediction-btest,atol=1e-12)
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--windows',required=True);p.add_argument('--output',required=True);a=p.parse_args();print(json.dumps(run(a.windows,a.output),indent=2))
