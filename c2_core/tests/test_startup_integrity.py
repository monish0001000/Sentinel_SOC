import asyncio
import unittest

from core.redis_state import initialize_redis_state
from core.seeder import seed_data


class FakeRedis:
    def __init__(self, initial=None):
        self.values = dict(initial or {})

    def setnx(self, key, value):
        if key in self.values:
            return False
        self.values[key] = value
        return True


class FakeFirewall:
    def __init__(self, policies=None):
        self.policies = list(policies or [])

    def get_policies(self):
        return list(self.policies)

    async def add_policy(self, policy):
        self.policies.append(policy)


class FakeSIEM:
    def __init__(self):
        self.events = []

    async def log_event(self, **event):
        self.events.append(event)


class RedisStartupTests(unittest.TestCase):
    def test_initialises_only_missing_sentinel_keys(self):
        client = FakeRedis({
            "unrelated_test_key": "preserve-me",
            "lockdown": "true",
            "panic_mode": "true",
        })

        created = initialize_redis_state(client)

        self.assertEqual(client.values["unrelated_test_key"], "preserve-me")
        self.assertEqual(client.values["lockdown"], "true")
        self.assertEqual(client.values["panic_mode"], "true")
        self.assertEqual(client.values["firewall_status"], "active")
        self.assertEqual(created, ["firewall_status"])

    def test_repeated_initialisation_is_idempotent(self):
        client = FakeRedis()
        first = initialize_redis_state(client)
        second = initialize_redis_state(client)

        self.assertEqual(len(first), 3)
        self.assertEqual(second, [])
        self.assertEqual(len(client.values), 3)


class SeederTests(unittest.TestCase):
    def test_seeder_does_not_generate_siem_events(self):
        firewall = FakeFirewall()
        siem = FakeSIEM()

        asyncio.run(seed_data(firewall, siem))

        self.assertEqual(siem.events, [])
        self.assertEqual(len(firewall.policies), 10)

    def test_policy_seeding_is_idempotent_and_preserves_existing_policy(self):
        existing = {"id": "existing-policy", "name": "User policy"}
        firewall = FakeFirewall([existing])
        siem = FakeSIEM()

        asyncio.run(seed_data(firewall, siem))
        asyncio.run(seed_data(firewall, siem))

        self.assertEqual(firewall.policies, [existing])
        self.assertEqual(siem.events, [])


if __name__ == "__main__":
    unittest.main()
