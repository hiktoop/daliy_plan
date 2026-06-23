"""Integration tests for /api/plans endpoints."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class TestCreatePlan:
    def test_create_long_plan(self, client):
        resp = client.post("/api/plans", json={
            "id": "p001", "text": "Yearly goal", "plan": "long"
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_create_week_plan(self, client):
        resp = client.post("/api/plans", json={
            "id": "p002", "text": "Weekly sprint", "plan": "week",
            "planStart": "2026-06-23"
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_create_month_plan(self, client):
        resp = client.post("/api/plans", json={
            "id": "p003", "text": "Monthly goal", "plan": "month",
            "planStart": "2026-06-01"
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestListPlans:
    def test_empty_plans(self, client):
        resp = client.get("/api/plans")
        assert resp.status_code == 200
        assert resp.json()["plans"] == []

    def test_list_with_streaks(self, client):
        client.post("/api/plans", json={"id": "p004", "text": "Plan A", "plan": "long"})
        resp = client.get("/api/plans")
        plans = resp.json()["plans"]
        assert len(plans) == 1
        assert plans[0]["text"] == "Plan A"
        assert "streak" in plans[0]


class TestUpdatePlan:
    def test_update_archives_old_and_creates_new(self, client):
        client.post("/api/plans", json={"id": "p005", "text": "Original", "plan": "long"})
        resp = client.put("/api/plans/p005", json={
            "id": "p006", "text": "Updated", "plan": "week",
            "planStart": "2026-06-23"
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        # Old plan should be archived
        plans = client.get("/api/plans").json()["plans"]
        plan_ids = [p["id"] for p in plans]
        assert "p005" not in plan_ids
        assert "p006" in plan_ids


class TestDeletePlan:
    def test_delete_archives_plan(self, client):
        client.post("/api/plans", json={"id": "p007", "text": "To delete", "plan": "long"})
        resp = client.delete("/api/plans/p007")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        # Should not appear in active list
        plans = client.get("/api/plans").json()["plans"]
        plan_ids = [p["id"] for p in plans]
        assert "p007" not in plan_ids
