import unittest
import numpy as np
from flow_field import FlowField


class FlowTests(unittest.TestCase):
    def run_field(self, field, states=None, observations=None):
        engine=FlowField()
        states=states or ['REFERENCE-LIKE']*9
        engine.update(0,None,90,90,states,observations or [])
        return engine, engine.update(.1,field,90,90,states,observations or [])

    def test_uniform_translation_and_projection(self):
        f=np.zeros((90,90,2)); f[:,:,0]=10
        _,r=self.run_field(f)
        self.assertAlmostEqual(r['cells'][0]['coherence'],1)
        self.assertAlmostEqual(r['paths'][0]['points'][-1][1],35)
        self.assertEqual(r['paths'][2]['end'],'Leaves selected region')

    def test_counterflow_not_stationary(self):
        f=np.zeros((90,90,2)); f[::2,:,0]=10; f[1::2,:,0]=-10
        _,r=self.run_field(f)
        self.assertEqual(r['cells'][0]['state'],'MIXED SCENE MOTION')
        self.assertEqual(r['cells'][0]['speed_px_s'],10)
        self.assertEqual(r['paths'],[])

    def test_obstruction_blocks_paths(self):
        f=np.zeros((90,90,2)); f[:,:,0]=10
        states=['REFERENCE-LIKE']*9; states[1]='DEGRADED'
        _,r=self.run_field(f,states)
        p=r['paths'][0]
        self.assertEqual(p['end'],'Unreliable or mixed zone')
        self.assertTrue(all(x<30 for _,x,y in p['points']))
        self.assertIsNone(r['cells'][1]['vx'])

    def test_flow_does_not_require_tracks(self):
        f=np.ones((90,90,2))*10
        _,r=self.run_field(f)
        self.assertTrue(r['paths'])
        self.assertEqual(r['cells'][0]['comparison'],'NO TRACK COMPARISON')

    def test_stale_time_disables_forecast(self):
        f=np.ones((90,90,2))*10
        engine,_=self.run_field(f)
        r=engine.update(2,f,90,90,['REFERENCE-LIKE']*9,[])
        self.assertEqual(r['paths'],[])

    def test_direction_disagreement_blocks_local_projection(self):
        engine=FlowField(); states=['REFERENCE-LIKE']*9
        obs=[(i,15+i,15) for i in range(3)]
        engine.update(0,None,90,90,states,obs)
        f=np.zeros((90,90,2)); f[:,:,0]=10
        r=engine.update(.1,f,90,90,states,[(i,x-1,y) for i,x,y in obs])
        self.assertEqual(r['cells'][0]['comparison'],'DIRECTIONS DISAGREE')
        self.assertNotIn('R1C1',[p['origin'] for p in r['paths']])

    def test_nan_field_no_false_forecast(self):
        _,r=self.run_field(np.full((90,90,2),np.nan))
        self.assertEqual(r['paths'],[])

    def test_quality_local_mask(self):
        from crowd_signals import QualityReference
        q=QualityReference()
        for i in range(32): q.update(i/10,[[20,100,.01]]*9)
        features=[[20,100,.01] for _ in range(9)]; features[0]=[1,1,.99]
        global_state,changed=q.update(3.3,features)
        self.assertEqual(global_state,'REFERENCE-LIKE')
        self.assertEqual(q.tile_states[0],'DEGRADED')
        self.assertEqual(changed,1)

if __name__=='__main__': unittest.main()
