"""Integration tests for /api/focus endpoints."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class TestFocusStartStop:
    def test_start_focus(self, client):
        resp = client.post("/api/focus/start", json={
            "task_id": "t001", "task_text": "Study math"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["date"] is not None
        assert data["start_ts"] > 0

    def test_start_without_task(self, client):
        resp = client.post("/api/focus/start", json={})
        assert resp.status_code == 200
        assert "id" in resp.json()

    def test_stop_focus_with_duration(self, client):
        start_resp = client.post("/api/focus/start", json={"task_text": "Work"})
        session_id = start_resp.json()["id"]

        stop_resp = client.post(f"/api/focus/{session_id}/stop", json={
            "duration": 1500, "note": "Completed"
        })
        assert stop_resp.status_code == 200
        data = stop_resp.json()
        assert data["duration"] == 1500
        assert data["note"] == "Completed"

    def test_stop_focus_auto_duration(self, client):
        start_resp = client.post("/api/focus/start", json={"task_text": "Quick task"})
        session_id = start_resp.json()["id"]

        stop_resp = client.post(f"/api/focus/{session_id}/stop")
        assert stop_resp.status_code == 200
        assert stop_resp.json()["duration"] >= 0

    def test_stop_already_stopped_session(self, client):
        start_resp = client.post("/api/focus/start", json={"task_text": "Work"})
        session_id = start_resp.json()["id"]
        client.post(f"/api/focus/{session_id}/stop")

        # Second stop should return error
        stop_resp = client.post(f"/api/focus/{session_id}/stop")
        assert stop_resp.status_code == 409

    def test_stop_nonexistent_session(self, client):
        resp = client.post("/api/focus/nonexistent/stop")
        assert resp.status_code == 404


class TestGetSessions:
    def test_get_sessions_for_date(self, client):
        start_resp = client.post("/api/focus/start", json={"task_text": "Work"})
        session_id = start_resp.json()["id"]
        date = start_resp.json()["date"]
        client.post(f"/api/focus/{session_id}/stop", json={"duration": 600})

        resp = client.get(f"/api/focus/{date}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["sessions"]) == 1
        assert data["total_seconds"] == 600

    def test_empty_date(self, client):
        resp = client.get("/api/focus/2020-01-01")
        assert resp.json()["sessions"] == []
        assert resp.json()["total_seconds"] == 0


class TestFocusStats:
    def test_summary(self, client):
        resp = client.get("/api/focus/stats/summary?days=7")
        assert resp.status_code == 200
        assert "stats" in resp.json()


class TestDeleteSession:
    def test_delete_session(self, client):
        start_resp = client.post("/api/focus/start", json={"task_text": "Test"})
        session_id = start_resp.json()["id"]

        del_resp = client.delete(f"/api/focus/{session_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["ok"] is True

        # Session should be gone
        date = start_resp.json()["date"]
        resp = client.get(f"/api/focus/{date}")
        assert resp.json()["sessions"] == []
