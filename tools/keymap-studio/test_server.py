"""Focused checks for selecting and flashing the exact CI build."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("corne_studio_server", Path(__file__).with_name("serve.py"))
serve = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(serve)


def handler(payload=None, path="/"):
    instance = object.__new__(serve.StudioHandler)
    instance.path = path
    instance._body = lambda: payload or {}
    replies = []
    instance._json = lambda status, body: replies.append((status, body))
    return instance, replies


class PipelineTests(unittest.TestCase):
    def test_bootloader_requires_nicenano_and_uf2_info(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "RPI-RP2").mkdir()
            (root / "NICENANO").mkdir()
            with patch.object(serve, "mount_roots", return_value=[root]):
                self.assertIsNone(serve.bootloader_volume())
                (root / "NICENANO" / "INFO_UF2.TXT").write_text("UF2 Bootloader\n")
                self.assertEqual(serve.bootloader_volume(), root / "NICENANO")

    def test_build_lookup_filters_to_selected_commit(self):
        sha = "a" * 40
        other = "b" * 40
        runs = [
            {"headSha": other, "workflowName": serve.WORKFLOW_NAME, "databaseId": 1,
             "status": "completed", "conclusion": "success", "url": "wrong"},
            {"headSha": sha, "workflowName": serve.WORKFLOW_NAME, "databaseId": 2,
             "status": "completed", "conclusion": "success", "url": "right"},
        ]
        instance, replies = handler(path=f"/api/run?sha={sha}")
        with patch.object(serve, "run", return_value=(True, json.dumps(runs), "")) as run:
            instance.api_run_status()
        self.assertEqual(replies[0][1]["runId"], 2)
        self.assertIn(sha, run.call_args.args[0])

    def test_flash_rejects_another_build_before_copy(self):
        sha = "a" * 40
        instance, replies = handler({"runId": 123, "sha": sha, "half": "left"})
        wrong_build = {"headSha": "b" * 40, "workflowName": serve.WORKFLOW_NAME,
                       "status": "completed", "conclusion": "success"}
        with patch.object(serve, "run", return_value=(True, json.dumps(wrong_build), "")) as run:
            instance.api_flash()
        self.assertEqual(replies[0][0], 409)
        self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
