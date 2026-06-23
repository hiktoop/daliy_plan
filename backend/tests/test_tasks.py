"""Integration tests for /api/tasks endpoints."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class TestSaveAndGetDay:
    def test_get_new_day_returns_skeleton(self, client):
        resp = client.get("/api/tasks/2026-06-23")
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == "2026-06-23"
        assert data.get("_new") is True
        assert "morningTasks" in data

    def test_save_day_creates_record(self, client):
        payload = {
            "date": "2026-06-23",
            "morningTasks": [
                {"id": "t001", "text": "Task 1", "kind": "task", "status": "todo"}
            ],
            "morningNote": "Morning plan",
            "savedMorning": True,
            "savedEvening": False,
        }
        resp = client.post("/api/tasks/2026-06-23", json=payload)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_get_saved_day_returns_data(self, client):
        payload = {
            "date": "2026-06-24",
            "morningTasks": [
                {"id": "t001", "text": "Study", "kind": "task", "status": "done"},
                {"id": "t002", "text": "Exercise", "kind": "habit", "status": "todo"},
            ],
            "morningNote": "Plan",
            "savedMorning": True,
            "savedEvening": True,
            "eveningNote": "All done",
        }
        client.post("/api/tasks/2026-06-24", json=payload)
        resp = client.get("/api/tasks/2026-06-24")
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == "2026-06-24"
        assert len(data["morningTasks"]) == 2
        assert data["savedMorning"] is True
        assert data["savedEvening"] is True
        assert data["eveningNote"] == "All done"

    def test_save_updates_existing_record(self, client):
        payload_v1 = {
            "date": "2026-06-25",
            "morningTasks": [{"id": "t001", "text": "Task 1", "kind": "task"}],
            "morningNote": "V1",
            "savedMorning": False,
            "savedEvening": False,
        }
        client.post("/api/tasks/2026-06-25", json=payload_v1)
        payload_v2 = {
            "date": "2026-06-25",
            "morningTasks": [{"id": "t001", "text": "Task 1", "kind": "task", "status": "done"}],
            "morningNote": "V2",
            "savedMorning": True,
            "savedEvening": True,
            "eveningNote": "Done",
        }
        client.post("/api/tasks/2026-06-25", json=payload_v2)
        resp = client.get("/api/tasks/2026-06-25")
        data = resp.json()
        assert data["morningNote"] == "V2"
        assert data["savedMorning"] is True
        assert data["savedEvening"] is True

    def test_review_tasks_are_filtered_on_save(self, client):
        payload = {
            "date": "2026-06-26",
            "morningTasks": [
                {"id": "_review_r001", "text": "复习: Math", "kind": "task", "itemType": "review", "status": "todo"},
                {"id": "t001", "text": "Normal task", "kind": "task", "status": "todo"},
            ],
            "savedMorning": True,
            "savedEvening": False,
        }
        client.post("/api/tasks/2026-06-26", json=payload)
        resp = client.get("/api/tasks/2026-06-26")
        data = resp.json()
        task_ids = [t["id"] for t in data["morningTasks"]]
        assert "_review_r001" not in task_ids
        assert "t001" in task_ids


class TestListDays:
    def test_empty_list(self, client):
        resp = client.get("/api/tasks")
        assert resp.status_code == 200
        assert resp.json()["days"] == []

    def test_non_saved_days_not_listed(self, client):
        client.post("/api/tasks/2026-06-27", json={
            "date": "2026-06-27",
            "morningTasks": [{"id": "t001", "text": "X", "kind": "task"}],
            "savedMorning": False,
            "savedEvening": False,
        })
        resp = client.get("/api/tasks")
        assert resp.json()["days"] == []

    def test_saved_days_are_listed(self, client):
        client.post("/api/tasks/2026-06-28", json={
            "date": "2026-06-28",
            "morningTasks": [{"id": "t001", "text": "X", "kind": "task"}],
            "savedMorning": True,
            "savedEvening": False,
        })
        resp = client.get("/api/tasks")
        days = resp.json()["days"]
        assert len(days) == 1
        assert days[0]["date"] == "2026-06-28"

    def test_days_sorted_descending(self, client):
        for d in ["2026-06-29", "2026-06-30", "2026-07-01"]:
            client.post(f"/api/tasks/{d}", json={
                "date": d,
                "morningTasks": [{"id": "t001", "text": "X", "kind": "task"}],
                "savedMorning": True,
                "savedEvening": False,
            })
        resp = client.get("/api/tasks")
        dates = [day["date"] for day in resp.json()["days"]]
        assert dates == ["2026-07-01", "2026-06-30", "2026-06-29"]


class TestAutoCreateReviews:
    def test_knowledge_task_done_creates_review(self, client):
        payload = {
            "date": "2026-07-02",
            "morningTasks": [
                {"id": "t001", "text": "Learn Python", "kind": "task",
                 "itemType": "knowledge", "status": "done"}
            ],
            "savedMorning": True,
            "savedEvening": False,
        }
        client.post("/api/tasks/2026-07-02", json=payload)
        # The review should now exist
        resp = client.get("/api/tasks/reviews/overview")
        data = resp.json()
        assert data["stats"]["learning"] >= 1

    def test_non_knowledge_done_does_not_create_review(self, client):
        payload = {
            "date": "2026-07-03",
            "morningTasks": [
                {"id": "t001", "text": "Regular task", "kind": "task", "status": "done"}
            ],
            "savedMorning": True,
            "savedEvening": False,
        }
        client.post("/api/tasks/2026-07-03", json=payload)
        resp = client.get("/api/tasks/reviews/overview")
        data = resp.json()
        assert data["stats"]["total"] == 0

    def test_knowledge_with_existing_review_id_not_duplicated(self, client):
        # First, create a review manually
        rev_resp = client.post("/api/tasks/review", json={"task_text": "Learn Java"})
        review_id = rev_resp.json()["reviewId"]

        # Then save a day with this task already linked to a review
        payload = {
            "date": "2026-07-04",
            "morningTasks": [
                {"id": "t001", "text": "Learn Java", "kind": "task",
                 "itemType": "knowledge", "status": "done", "reviewId": review_id}
            ],
            "savedMorning": True,
            "savedEvening": False,
        }
        client.post("/api/tasks/2026-07-04", json=payload)
        resp = client.get("/api/tasks/reviews/overview")
        # Should not create duplicate
        data = resp.json()
        assert data["stats"]["total"] == 1
