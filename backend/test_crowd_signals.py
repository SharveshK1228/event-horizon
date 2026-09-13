import unittest
from crowd_signals import SignalMemory, QualityReference, infer


class SignalTests(unittest.TestCase):
    def test_local_tile_loss_flags_and_recovers(self):
        quality = QualityReference()
        clear = [[30,100,.01] for _ in range(9)]
        for i in range(11):
            self.assertEqual(quality.update(i*.3,clear)[0],'WARMING UP')
        self.assertEqual(quality.update(3.4,clear)[0],'REFERENCE-LIKE')
        covered = [[1,1,.9],[1,1,.9]]+clear[2:]
        self.assertEqual(quality.update(3.5,covered),('DEGRADED',2))
        self.assertEqual(quality.update(3.6,clear),('REFERENCE-LIKE',0))

    def test_blind_frames_cannot_refresh_memory(self):
        memory = SignalMemory(ttl=2)
        memory.update(0,[(1,10,20)],True)
        ghosts,vector = memory.update(1,[(1,900,900),(2,50,50)],False)
        self.assertEqual(ghosts,[(1,10,20,1)])
        self.assertIsNone(vector)
        self.assertEqual(memory.update(2.01,[],False)[0],[])

    def test_reacquisition_does_not_invent_velocity(self):
        memory = SignalMemory()
        memory.update(0,[(i,i,0) for i in range(3)],True)
        ghosts,vector = memory.update(1,[(i,i+100,0) for i in range(3)],True)
        self.assertIsNone(vector)
        self.assertEqual(ghosts,[])

    def test_short_occlusion_breaks_velocity_continuity(self):
        memory = SignalMemory()
        memory.update(0,[(i,i,0) for i in range(3)],True)
        memory.update(.1,[],False)
        self.assertIsNone(memory.update(.2,[(i,i+100,0) for i in range(3)],True)[1])

    def test_continuous_tracks_have_time_based_velocity(self):
        memory = SignalMemory()
        memory.update(0,[(i,i,0) for i in range(3)],True)
        _,vector = memory.update(.2,[(i,i+2,0) for i in range(3)],True)
        self.assertEqual(vector,(10,0))

    def test_visibility_overrides_apparent_agreement(self):
        self.assertEqual(infer('DEGRADED',999,(10,0),(10,0),100)[0],'VISIBILITY CHECK')

    def test_opposite_flow_is_disagreement(self):
        self.assertEqual(infer('REFERENCE-LIKE',10,(10,0),(-10,0),100)[0],'SIGNALS DISAGREE')

    def test_missing_flow_never_claims_agreement(self):
        self.assertEqual(infer('REFERENCE-LIKE',10,(10,0),None,100)[0],'INSUFFICIENT MOTION')


if __name__ == '__main__':
    unittest.main()
