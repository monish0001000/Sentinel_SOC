import asyncio
import unittest

from agent.sentinel_agent import SentinelAgent


class WindowsAgentSmokeTests(unittest.TestCase):
    def test_host_metrics_have_expected_fields(self):
        agent = object.__new__(SentinelAgent)
        stats = agent.get_stats()
        self.assertEqual(set(stats), {"cpu", "memory", "disk", "processes"})
        self.assertGreaterEqual(stats["cpu"], 0)
        self.assertGreaterEqual(stats["memory"], 0)
        self.assertGreaterEqual(stats["disk"], 0)
        self.assertGreaterEqual(stats["processes"], 0)

    def test_remote_response_is_disabled_by_default(self):
        agent = object.__new__(SentinelAgent)
        agent.allow_remote_response = False
        result = asyncio.run(agent.execute_command({
            "command": "isolate_host",
            "args": {"whitelist": ["127.0.0.1"]},
            "id": "test-command",
        }))
        self.assertEqual(result["result"]["status"], "disabled")


if __name__ == "__main__":
    unittest.main()
