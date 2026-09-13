import unittest
from crowd_forecast import CrowdForecast


class ForecastTests(unittest.TestCase):
    def feed(self, model, points, total=None):
        for t in (0., .2, .4):
            result = model.update(t,[(i,x+vx*t,y+vy*t) for i,(x,y,vx,vy) in enumerate(points)],
                total or len(points),300,300,'REFERENCE-LIKE','FLOW AGREES')
        return result

    def test_convergence(self):
        result = self.feed(CrowdForecast(threshold=3),[(70,150,30,0),(230,150,-30,0),(150,150,0,0)])
        center = next(c for c in result['cells'] if c['cell']=='R2C2' and c['horizon_s']==2)
        self.assertEqual(center['projected_tracks'],3)
        self.assertEqual(center['change'],2)
        self.assertTrue(center['concentration_flag'])

    def test_uniform_motion(self):
        result = self.feed(CrowdForecast(),[(110,140,5,0),(120,150,5,0),(130,160,5,0)])
        self.assertEqual(sum(c['projected_tracks'] for c in result['cells'] if c['horizon_s']==1),3)
        self.assertEqual(result['status'],'PROJECTION AVAILABLE')

    def test_exits_are_not_clipped(self):
        result = self.feed(CrowdForecast(),[(280,y,20,0) for y in (20,30,40)])
        self.assertEqual(sum(c['projected_tracks'] for c in result['cells']),0)

    def test_unassigned_detections_reduce_coverage(self):
        result = self.feed(CrowdForecast(),[(20,y,1,0) for y in (20,30,40)],total=10)
        self.assertEqual(result['status'],'UNAVAILABLE')
        self.assertAlmostEqual(result['coverage'],.3)

    def test_visibility_resets_history(self):
        model = CrowdForecast()
        points = [(20,y,1,0) for y in (20,30,40)]
        self.feed(model,points)
        self.assertFalse(model.update(.5,[],0,300,300,'DEGRADED','VISIBILITY CHECK')['cells'])
        self.assertFalse(model.update(.6,[(i,20,y) for i,y in enumerate((20,30,40))],3,300,300,'REFERENCE-LIKE','FLOW AGREES')['cells'])

    def test_gap_resets_velocity(self):
        model = CrowdForecast()
        self.feed(model,[(20,y,1,0) for y in (20,30,40)])
        self.assertFalse(model.update(2,[(i,20,y) for i,y in enumerate((20,30,40))],3,300,300,'REFERENCE-LIKE','FLOW AGREES')['cells'])

    def test_missing_ids_not_remembered(self):
        model = CrowdForecast()
        self.feed(model,[(20,y,1,0) for y in (20,30,40)])
        result = model.update(.5,[],0,300,300,'REFERENCE-LIKE','LOW NET MOTION')
        self.assertFalse(result['cells'])
        self.assertEqual(model.history,{})

    def test_disagreement_blocks(self):
        model = CrowdForecast()
        self.feed(model,[(20,y,1,0) for y in (20,30,40)])
        self.assertFalse(model.update(.5,[],3,300,300,'REFERENCE-LIKE','SIGNALS DISAGREE')['cells'])


if __name__ == '__main__':
    unittest.main()
