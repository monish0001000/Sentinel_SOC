import unittest


class ApplicationImportTests(unittest.TestCase):
    def test_main_application_modules_import(self):
        # Import-only smoke test: catches missing Docker dependencies and
        # module-level startup errors without launching background services.
        import main
        self.assertTrue(callable(main.main))


if __name__ == "__main__":
    unittest.main()
