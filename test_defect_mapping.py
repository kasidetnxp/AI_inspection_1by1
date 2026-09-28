import unittest

# Canonical 8 Defect Mode Names as agreed
EXPECTED_MODES = {
    1: "Probe mark damage",
    2: "Probe mark close to edge",
    3: "Probe mark too large",
    4: "Probe mark too small",
    5: "Probe mark not found",
    6: "Probe mark white",
    7: "Probe mark too long",
    8: "Others"
}

class TestDefectMapping(unittest.TestCase):
    def test_single_reason_categorization_and_mode(self):
        from main import categorize_failure_reason, map_reason_to_mode, extract_modes_from_reason

        test_cases = [
            ("Probemark damaged and chipped", "Probe mark damage", 1),
            ("Probemark too close to edge (5.2um < 8.0um)", "Probe mark close to edge", 2),
            ("Probemark area too large (28.5% > 25.0%)", "Probe mark too large", 3),
            ("Big Probe Mark", "Probe mark too large", 3),
            ("Probemark area too small (0.2% < 0.5%)", "Probe mark too small", 4),
            ("No probemark detected on pad", "Probe mark not found", 5),
            ("No Probe Mark", "Probe mark not found", 5),
            ("Probemark too light (white defect)", "Probe mark white", 6),
            ("Probemark too long", "Probe mark too long", 7),
            ("Corrupted or Unreadable Image", "Others", 8),
            ("AI Inference Failure", "Others", 8),
            ("Unknown (Cannot classify pad)", "Others", 8),
        ]

        for raw_reason, expected_cat, expected_mode in test_cases:
            cat = categorize_failure_reason(raw_reason)
            self.assertEqual(cat, expected_cat, f"Categorization mismatch for '{raw_reason}'")
            mode = map_reason_to_mode(cat)
            self.assertEqual(mode, expected_mode, f"Mode mismatch for '{cat}'")

    def test_multiple_reasons_combination(self):
        from main import categorize_failure_reason, extract_modes_from_reason, build_batch_judgement

        raw = "Probemark area too large (28.5% > 25.0%) & Probemark too close to edge (5.2um < 8.0um)"
        cat = categorize_failure_reason(raw)
        self.assertIn("Probe mark too large", cat)
        self.assertIn("Probe mark close to edge", cat)

        modes = extract_modes_from_reason(cat)
        self.assertEqual(modes, {2, 3})

        # Test batch judgement mask
        batch_records = [{"decision": "FAIL", "reason": cat}]
        dec, mask8, summary = build_batch_judgement(batch_records)
        self.assertEqual(dec, "FAIL")
        self.assertEqual(mask8, "02300000")
        self.assertIn(2, summary)
        self.assertIn(3, summary)

    def test_all_pass_judgement(self):
        from main import build_batch_judgement

        batch_records = [{"decision": "PASS", "reason": "-"}]
        dec, mask8, summary = build_batch_judgement(batch_records)
        self.assertEqual(dec, "PASS")
        self.assertEqual(mask8, "00000000")
        self.assertEqual(summary, {})

if __name__ == "__main__":
    unittest.main()
