import unittest

from server.websocket_manager import RealTimeStats


class PassiveNetworkSemanticsTests(unittest.TestCase):
    def test_observed_socket_is_not_counted_as_a_block(self):
        stats = RealTimeStats()
        stats.add_packet_stat({"src_ip": "127.0.0.1", "dst_port": 443, "status": "OBSERVED"})
        result = stats.get_stats()
        self.assertEqual(result["totalPackets"], 1)
        self.assertEqual(result["threatsBlocked"], 0)
        self.assertEqual(result["allowed"], 1)

    def test_policy_match_is_not_reported_as_enforced_block(self):
        stats = RealTimeStats()
        stats.add_packet_stat({"src_ip": "203.0.113.10", "dst_port": 22, "status": "POLICY_MATCH"})
        result = stats.get_stats()
        self.assertEqual(result["threatsBlocked"], 0)
        self.assertEqual(result["suspicious"], 1)


if __name__ == "__main__":
    unittest.main()
