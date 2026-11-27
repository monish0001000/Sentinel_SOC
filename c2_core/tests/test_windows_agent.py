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


if __name__ == "__main__":
    unittest.main()
