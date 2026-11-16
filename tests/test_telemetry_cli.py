from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import unittest
from unittest.mock import patch

from app.collector import telemetry


class TelemetryCliTests(unittest.TestCase):
    def test_external_snapshot_directory_prints_saved_path_without_relative_path_error(self):
        output = StringIO()
        snapshot = {"routers": [{"router": "r1", "healthy_collection": True, "bgp": {}, "interfaces": {}}]}
        saved_path = Path("/tmp/netscope-runs/telemetry_test.json")
        with patch.object(telemetry, "collect_snapshot", return_value=snapshot), patch.object(telemetry, "save_snapshot", return_value=saved_path), redirect_stdout(output):
            telemetry.main(["--output-dir", "/tmp/netscope-runs"])
        self.assertIn(str(saved_path), output.getvalue())
        self.assertIn("R1: OK", output.getvalue())


if __name__ == "__main__":
    unittest.main()
