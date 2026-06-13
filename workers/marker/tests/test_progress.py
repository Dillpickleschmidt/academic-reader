import sys
import types
import unittest

from app.progress import install_tqdm_progress_hook


class FakeEventClient:
    def __init__(self):
        self.events = []

    def emit(self, **event):
        self.events.append(event)


class BaseTqdm:
    def __init__(self, *args, total=None, desc=None, **kwargs):
        self.n = 0
        self.total = total
        self.desc = desc

    def update(self, n=1):
        self.n += n

    def close(self):
        return None


class ProgressHookTest(unittest.TestCase):
    def test_tqdm_progress_hook_emits_progress(self):
        original_modules = {name: sys.modules.get(name) for name in ("tqdm", "tqdm.std", "tqdm.auto")}
        fake_tqdm = types.SimpleNamespace(tqdm=BaseTqdm)
        sys.modules["tqdm"] = fake_tqdm
        sys.modules["tqdm.std"] = types.SimpleNamespace(tqdm=BaseTqdm)
        sys.modules["tqdm.auto"] = types.SimpleNamespace(tqdm=BaseTqdm)

        try:
            client = FakeEventClient()
            with install_tqdm_progress_hook(client, throttle_seconds=0):
                bar = sys.modules["tqdm"].tqdm(total=2, desc="unit-test")
                bar.update(1)
                bar.update(1)
                bar.close()

            self.assertTrue(any(event["type"] == "conversion.progress" for event in client.events))
            self.assertTrue(any(event["progress"].get("percent") == 100 for event in client.events))
        finally:
            for name, module in original_modules.items():
                if module is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = module


if __name__ == "__main__":
    unittest.main()
