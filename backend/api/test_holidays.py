import json
from unittest.mock import MagicMock, patch
from urllib.error import URLError

from django.test import SimpleTestCase, override_settings

from .holidays import fetch_national_weekday_holidays


def source_item(day, scope="Nacional"):
    return {"date": day, "title": "Feriado", "type": "Civil", "is_irrenunciable": False, "scope": scope}


@override_settings(ALLOWED_HOSTS=["testserver"])
class HolidayApiTests(SimpleTestCase):
    @patch("api.holidays.urlopen")
    def test_selects_national_weekdays(self, urlopen):
        response = MagicMock()
        response.read.return_value = json.dumps({"data": [
            source_item("2026-05-01"), source_item("2026-05-02"),
            source_item("2026-05-03"), source_item("2026-06-08", "Regional"),
        ]}).encode()
        urlopen.return_value.__enter__.return_value = response
        result = fetch_national_weekday_holidays()
        self.assertEqual(len(result), 1)
        self.assertEqual(str(result[0][0]), "2026-05-01")
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 8)

    @patch("api.holidays.urlopen")
    def test_rejects_duplicate_dates_and_invalid_payload(self, urlopen):
        response = MagicMock()
        urlopen.return_value.__enter__.return_value = response
        for payload in ({"data": [source_item("2026-05-01")] * 2}, {"data": {}}):
            response.read.return_value = json.dumps(payload).encode()
            with self.assertRaises(ValueError):
                fetch_national_weekday_holidays()

    @patch("api.holidays.urlopen", side_effect=URLError("unavailable"))
    def test_upstream_errors_are_propagated(self, urlopen):
        with self.assertRaises(URLError):
            fetch_national_weekday_holidays()
