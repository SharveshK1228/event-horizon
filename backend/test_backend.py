import json,tempfile,unittest
from pathlib import Path
from backend import label_data,history_clear,check_labels,load_training,train,predict,FEATURES,records

class BackendTests(unittest.TestCase):
    def interval(self,a,b,state='free_flow',visibility='clear'):
        return dict(start_s=a,end_s=b,state=state,visibility=visibility,reviewer='synthetic test')
    def test_visibility_gaps_and_boundaries(self):
        self.assertFalse(history_clear([self.interval(0,1),self.interval(2,5)],0,3))
        self.assertFalse(history_clear([self.interval(0,3),self.interval(3,5,visibility='obscured')],0,3))
        self.assertTrue(history_clear([self.interval(0,6)],0,3))
    def test_overlaps_rejected(self):
        with self.assertRaises(ValueError):check_labels({'intervals':[self.interval(0,4),self.interval(3,6)]})
    def test_future_label_and_occlusion(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);feature=root/'f.jsonl';lab=root/'l.json';out=root/'o.jsonl'
            sample=dict(video_id='v',zone='Full view',history_start_s=0,history_end_s=3,target_time_s=5,features={'track_continuity':1,'median_frame_speed_px_s':10},label=None)
            feature.write_text(json.dumps(sample)+'\n')
            labels=dict(video_id='v',zone='Full view',source_video='synthetic.mp4',intervals=[self.interval(0,4),self.interval(4,7,'surge')])
            lab.write_text(json.dumps(labels));result=label_data(feature,lab,out)
            self.assertEqual(result['labelled'],1);self.assertEqual(records(out)[0]['label'],'surge')
            labels['intervals'][1]['visibility']='obscured';lab.write_text(json.dumps(labels))
            self.assertEqual(label_data(feature,lab,out)['labelled'],0)
    def fixture(self,root):
        manifest={'grouping_reviewed':True,'recordings':[]}
        for split in ['train','validation','test']:
            rows=[]
            for i in range(40):
                label='free_flow' if i%2==0 else 'surge'
                features={k:float(i%2*10+1) for k in FEATURES};features['track_continuity']=.9
                rows.append(dict(video_id=split,zone='Full view',history_start_s=i,history_end_s=i+3,target_time_s=i+5,
                                 current_state='free_flow',label=label,features=features))
            (root/f'{split}.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))
            (root/f'{split}.json').write_text(json.dumps(dict(video_id=split,source_sha256=split,window_s=3,horizon_s=2,stride_s=1)))
            manifest['recordings'].append(dict(video_id=split,event_group=split,split=split,audit=f'{split}.json',labelled_features=f'{split}.jsonl'))
        path=root/'manifest.json';path.write_text(json.dumps(manifest));return path,manifest
    def test_event_leakage_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path,m=self.fixture(Path(d));m['recordings'][1]['event_group']='train';path.write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError,'Same event'):load_training(path)
    def test_missing_class_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);path,m=self.fixture(root)
            p=root/'test.jsonl';rows=records(p)
            for r in rows:r['label']='free_flow'
            p.write_text(''.join(json.dumps(r)+'\n' for r in rows))
            with self.assertRaisesRegex(ValueError,'every class'):load_training(path)
    def test_training_and_inference_wiring_synthetic_only(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);manifest,_=self.fixture(root);out=root/'model'
            result=train(manifest,out);self.assertEqual(result['status'],'trained')
            lab=root/'visibility.json';lab.write_text(json.dumps(dict(video_id='test',zone='Full view',intervals=[self.interval(0,100)])))
            preds=root/'pred.jsonl';predict(out/'model.joblib',root/'test.jsonl',lab,preds)
            self.assertEqual(len(records(preds)),40)
            labels=json.loads(lab.read_text());labels['intervals'][0]['visibility']='obscured';lab.write_text(json.dumps(labels))
            predict(out/'model.joblib',root/'test.jsonl',lab,preds)
            self.assertTrue(all(r['state']=='UNKNOWN' for r in records(preds)))

if __name__=='__main__':unittest.main()
