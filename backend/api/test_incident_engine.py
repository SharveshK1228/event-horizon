import unittest

from incident_engine import choose_rule, make_incident


class IncidentRulesTest(unittest.TestCase):
    def test_priority_visibility_before_tracking(self):
        rule, _ = choose_rule(
            {"tracking_state": "TRACKING UNAVAILABLE", "visibility_status": "degraded"}
        )
        self.assertEqual(rule.incident_type, "visibility_degraded")

    def test_clear_produces_no_incident(self):
        self.assertIsNone(
            make_incident(
                {
                    "tracking_state": "TRACK MOTION AVAILABLE",
                    "visibility_status": "reference-like",
                    "motion_state": "OBSERVED MOTION",
                },
                "camera-1",
            )
        )

    def test_camera_motion_suspends_motion_inference(self):
        rule, evidence = choose_rule(
            {
                "tracking_state": "INSUFFICIENT TRACK SUPPORT",
                "visibility_status": "reference-like",
                "motion_state": "CAMERA MOVEMENT SUSPECTED",
            }
        )
        self.assertEqual(rule.sop_id, "SOP-CAMERA-01")
        self.assertTrue(any("suspended" in item for item in evidence))

    def test_collective_motion_is_verification_only(self):
        item = make_incident(
            {
                "tracking_state": "TRACK MOTION AVAILABLE",
                "visibility_status": "reference-like",
                "motion_state": "UNUSUAL COLLECTIVE MOVEMENT",
                "video_time_s": 12.0,
            },
            "camera-1",
        )
        self.assertEqual(item["sop_id"], "SOP-CROWD-01")
        self.assertTrue(any("not a validated surge" in x for x in item["evidence"]))


if __name__ == "__main__":
    unittest.main()
