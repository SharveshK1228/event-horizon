import csv,json,tempfile,unittest
from pathlib import Path
from trajectory_features import prepare

class PrepTests(unittest.TestCase):
    def write(self,p,future=False,gap=False):
        with p.open('w',newline='') as f:
            w=csv.writer(f);w.writerow(['frame','time_s','track_id','anchor_x','anchor_y'])
            for i in range(81):
                if gap and i%2:continue
                t=i/10
                for tid in range(3):w.writerow([i,t,tid,10*t+tid+(100 if future and t>3 else 0),20])
    def test_causal_features_and_label_preservation(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'a.csv';out=Path(d)/'out'
            self.write(p);prepare(p,'a',out)
            first=json.loads((out/'features.jsonl').read_text().splitlines()[0])
            self.assertAlmostEqual(first['features']['median_frame_speed_px_s'],10)
            (out/'labels_to_review.json').write_text('{"reviewed":true}')
            self.write(p,future=True);prepare(p,'a',out)
            new=json.loads((out/'features.jsonl').read_text().splitlines()[0])
            self.assertEqual(first,new)
            self.assertEqual((out/'labels_to_review.json').read_text(),'{"reviewed":true}')
            self.assertIsNone(new['label'])
            self.assertEqual(new['target_time_s'],5)
    def test_does_not_bridge_missing_frames(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'a.csv';out=Path(d)/'out'
            self.write(p,gap=True);prepare(p,'a',out)
            row=json.loads((out/'features.jsonl').read_text().splitlines()[0])
            self.assertIsNone(row['features']['median_frame_speed_px_s'])
            self.assertEqual(row['features']['track_continuity'],0)

if __name__=='__main__':unittest.main()
