"""Integration tests for /api/stats and /api/streaks endpoints."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class TestStats:
    def test_empty_stats(self, client):
        resp = client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["done"] == 0
        assert data["rate"] is None

    def test_stats_with_data(self, client):
        client.post("/api/tasks/2026-06-23", json={
            "date": "2026-06-23",
            "morningTasks": [
                {"id": "t001", "text": "Task 1", "kind": "task", "status": "done"},
                {"id": "t002", "text": "Task 2", "kind": "task", "status": "partial"},
                {"id": "t003", "text": "Task 3", "kind": "task", "status": "miss"},
                {"id": "t004", "text": "Task 4", "kind": "task", "status": None},
            ],
            "savedMorning": True,
            "savedEvening": False,
        })
        resp = client.get("/api/stats")
        data = resp.json()
        assert data["total"] == 4
        assert data["done"] == 1
        assert data["partial"] == 1
        assert data["miss"] == 1
        assert data["rate"] == 25  # 1/4 = 25%

    def test_stats_period_week(self, client):
        resp = client.get("/api/stats?period=week")
        assert resp.status_code == 200
        assert "total" in resp.json()

    def test_stats_period_month(self, client):
        resp = client.get("/api/stats?period=month")
        assert resp.status_code == 200
        assert "total" in resp.json()

    def test_empty_tasks_not_counted(self, client):
        client.post("/api/tasks/2026-06-24", json={
            "date": "2026-06-24",
            "morningTasks": [
                {"id": "t001", "text": "", "kind": "task", "status": None},
                {"id": "t002", "text": "Real", "kind": "task", "status": "done"},
            ],
            "savedMorning": True,
            "savedEvening": False,
        })
        resp = client.get("/api/stats")
        data = resp.json()
        assert data["total"] == 1  # empty text task not counted


class TestStreaks:
    def test_get_streaks_empty(self, client):
        resp = client.get("/api/streaks")
        assert resp.json()["streaks"] == {}

    def test_update_streak_new_plan(self, client):
        client.post("/api/plans", json={"id": "p001", "text": "Goal", "plan": "long"})
        resp = client.post("/api/streaks/p001", params={"date_str": "2026-06-23", "status": "done"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["current"] == 1

    def test_streak_consecutive_days(self, client):
        client.post("/api/plans", json={"id": "p002", "text": "Goal 2", "plan": "long"})
        client.post("/api/streaks/p002", params={"date_str": "2026-06-23", "status": "done"})
        client.post("/api/streaks/p002", params={"date_str": "2026-06-24", "status": "done"})
        resp = client.post("/api/streaks/p002", params={"date_str": "2026-06-25", "status": "done"})
        assert resp.json()["current"] == 3

    def test_streak_non_consecutive_resets(self, client):
        client.post("/api/plans", json={"id": "p003", "text": "Goal 3", "plan": "long"})
        client.post("/api/streaks/p003", params={"date_str": "2026-06-23", "status": "done"})
        # Skip a day
        client.post("/api/streaks/p003", params={"date_str": "2026-06-25", "status": "done"})
        resp = client.post("/api/streaks/p003", params={"date_str": "2026-06-26", "status": "done"})
        assert resp.json()["current"] == 2  # reset to 1 at 06-25, then +1

    def test_streak_not_done_resets(self, client):
        client.post("/api/plans", json={"id": "p004", "text": "Goal 4", "plan": "long"})
        client.post("/api/streaks/p004", params={"date_str": "2026-06-23", "status": "done"})
        client.post("/api/streaks/p004", params={"date_str": "2026-06-24", "status": "done"})
        client.post("/api/streaks/p004", params={"date_str": "2026-06-25", "status": "miss"})
        resp = client.get("/api/streaks")
        streak = resp.json()["streaks"]["p004"]
        assert streak["current"] == 0

    def test_best_streak_preserved(self, client):
        client.post("/api/plans", json={"id": "p005", "text": "Goal 5", "plan": "long"})
        # Build streak of 3
        for d in ["2026-06-23", "2026-06-24", "2026-06-25"]:
            client.post("/api/streaks/p005", params={"date_str": d, "status": "done"})
        # Break it
        client.post("/api/streaks/p005", params={"date_str": "2026-06-26", "status": "miss"})
        resp = client.get("/api/streaks")
        streak = resp.json()["streaks"]["p005"]
        assert streak["best"] == 3
        assert streak["current"] == 0
