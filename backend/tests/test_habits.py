"""Integration tests for /api/habits endpoints."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class TestCreateHabit:
    def test_create_minimal_habit(self, client):
        resp = client.post("/api/habits", json={"name": "Run"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        assert "id" in resp.json()

    def test_create_full_habit(self, client):
        resp = client.post("/api/habits", json={
            "name": "Read", "frequency": "weekly",
            "target_value": 3, "icon": "\U0001f4da", "color": "#378ADD"
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestListHabits:
    def test_empty_list(self, client):
        resp = client.get("/api/habits")
        assert resp.status_code == 200
        assert resp.json()["habits"] == []

    def test_list_with_habits(self, client):
        client.post("/api/habits", json={"name": "Run"})
        resp = client.get("/api/habits")
        habits = resp.json()["habits"]
        assert len(habits) == 1
        h = habits[0]
        assert h["name"] == "Run"
        assert "streak" in h
        assert "checked_today" in h
        assert h["checked_today"] is False


class TestCheckIn:
    def test_check_in(self, client):
        resp = client.post("/api/habits", json={"name": "Run"})
        habit_id = resp.json()["id"]

        check_resp = client.post(f"/api/habits/{habit_id}/check", json={"note": "5km"})
        assert check_resp.status_code == 200
        assert check_resp.json()["ok"] is True

        # Verify checked_today
        habits = client.get("/api/habits").json()["habits"]
        h = [h for h in habits if h["id"] == habit_id][0]
        assert h["checked_today"] is True
        assert h["note_today"] == "5km"

    def test_check_in_already_checked_updates_note(self, client):
        resp = client.post("/api/habits", json={"name": "Run"})
        habit_id = resp.json()["id"]

        client.post(f"/api/habits/{habit_id}/check", json={"note": "First"})
        client.post(f"/api/habits/{habit_id}/check", json={"note": "Updated"})

        habits = client.get("/api/habits").json()["habits"]
        h = [h for h in habits if h["id"] == habit_id][0]
        assert h["note_today"] == "Updated"

    def test_uncheck(self, client):
        resp = client.post("/api/habits", json={"name": "Run"})
        habit_id = resp.json()["id"]

        client.post(f"/api/habits/{habit_id}/check")
        client.delete(f"/api/habits/{habit_id}/check")

        habits = client.get("/api/habits").json()["habits"]
        h = [h for h in habits if h["id"] == habit_id][0]
        assert h["checked_today"] is False

    def test_check_in_unknown_habit_fails(self, client):
        # FK constraint on habit_logs → sqlite3.IntegrityError → 500 via FastAPI
        # The httpx test client raises the exception directly
        with pytest.raises(Exception):
            client.post("/api/habits/nonexistent/check")


class TestArchiveHabit:
    def test_archive_hides_from_list(self, client):
        resp = client.post("/api/habits", json={"name": "Run"})
        habit_id = resp.json()["id"]

        client.delete(f"/api/habits/{habit_id}")
        habits = client.get("/api/habits").json()["habits"]
        assert habit_id not in [h["id"] for h in habits]


class TestHabitLogs:
    def test_get_logs(self, client):
        resp = client.post("/api/habits", json={"name": "Run"})
        habit_id = resp.json()["id"]
        client.post(f"/api/habits/{habit_id}/check")

        logs_resp = client.get(f"/api/habits/{habit_id}/logs?days=30")
        assert logs_resp.status_code == 200
        logs = logs_resp.json()["logs"]
        assert len(logs) >= 1
        assert logs[-1]["habit_id"] == habit_id

    def test_get_empty_logs(self, client):
        resp = client.post("/api/habits", json={"name": "Run"})
        habit_id = resp.json()["id"]

        logs_resp = client.get(f"/api/habits/{habit_id}/logs?days=30")
        assert logs_resp.json()["logs"] == []


class TestHeatmap:
    def test_heatmap_with_data(self, client):
        resp = client.post("/api/habits", json={"name": "Run"})
        habit_id = resp.json()["id"]
        client.post(f"/api/habits/{habit_id}/check")

        heat_resp = client.get("/api/habits/heatmap?days=84")
        assert heat_resp.status_code == 200
        heatmap = heat_resp.json()["heatmap"]
        assert len(heatmap) >= 1
        assert heatmap[0]["habit_id"] == habit_id

    def test_heatmap_empty(self, client):
        heat_resp = client.get("/api/habits/heatmap?days=7")
        assert heat_resp.json()["heatmap"] == []
