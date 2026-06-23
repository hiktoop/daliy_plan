"""Integration tests for /api/tasks/review endpoints (Ebbinghaus + SM-2)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class TestCreateReview:
    def test_create_review_default_start(self, client):
        resp = client.post("/api/tasks/review", json={"task_text": "Learn Python"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "reviewId" in data
        assert "nextReview" in data

    def test_create_review_with_custom_start(self, client):
        resp = client.post("/api/tasks/review", json={
            "task_text": "Learn Rust",
            "start_date": "2026-07-01"
        })
        assert resp.status_code == 200
        assert resp.json()["nextReview"] == "2026-07-01"

    def test_create_review_with_source_url(self, client):
        resp = client.post("/api/tasks/review", json={
            "task_text": "Learn Rust",
            "source_url": "https://rust-lang.org"
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestDueReviews:
    def test_no_reviews_due(self, client):
        resp = client.get("/api/tasks/reviews/due?date_str=2099-12-31")
        assert resp.json()["reviews"] == []

    def test_review_due_today(self, client):
        from datetime import date
        today = date.today().isoformat()
        client.post("/api/tasks/review", json={
            "task_text": "Learn Go", "start_date": today
        })
        resp = client.get("/api/tasks/reviews/due")
        reviews = resp.json()["reviews"]
        assert len(reviews) >= 1

    def test_review_due_in_future(self, client):
        resp = client.get("/api/tasks/reviews/due?date_str=2099-12-31")
        reviews = resp.json()["reviews"]
        # Reviews with start_date <= 2099-12-31 should appear
        assert isinstance(reviews, list)


class TestMarkReviewDone:
    def test_mark_done_quality_5(self, client):
        create_resp = client.post("/api/tasks/review", json={
            "task_text": "Learn JS", "start_date": "2026-06-23"
        })
        review_id = create_resp.json()["reviewId"]

        resp = client.post(f"/api/tasks/review/{review_id}/done?quality=5")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "nextReview" in data
        assert data["round"] == 1

    def test_mark_done_quality_1_resets(self, client):
        create_resp = client.post("/api/tasks/review", json={
            "task_text": "Forget me", "start_date": "2026-06-23"
        })
        review_id = create_resp.json()["reviewId"]

        resp = client.post(f"/api/tasks/review/{review_id}/done?quality=1")
        assert resp.status_code == 200
        data = resp.json()
        # Interval should be 1 after reset
        assert data["interval"] == 1

    def test_mark_done_nonexistent(self, client):
        resp = client.post("/api/tasks/review/nonexistent/done?quality=5")
        assert resp.status_code == 404

    def test_graduate_after_6_rounds(self, client):
        create_resp = client.post("/api/tasks/review", json={
            "task_text": "Graduate me", "start_date": "2026-06-23"
        })
        review_id = create_resp.json()["reviewId"]

        for _ in range(6):
            resp = client.post(f"/api/tasks/review/{review_id}/done?quality=5")
            if resp.json().get("status") == "graduated":
                break

        assert resp.json()["status"] == "graduated"


class TestDeleteReview:
    def test_soft_delete(self, client):
        create_resp = client.post("/api/tasks/review", json={"task_text": "Delete me"})
        review_id = create_resp.json()["reviewId"]

        resp = client.delete(f"/api/tasks/review/{review_id}")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Should not appear in overview
        overview = client.get("/api/tasks/reviews/overview").json()
        all_ids = [r["id"] for r in overview["learning"] + overview["reviewing"] + overview["graduated"]]
        assert review_id not in all_ids


class TestReviewsOverview:
    def test_empty_overview(self, client):
        resp = client.get("/api/tasks/reviews/overview")
        assert resp.status_code == 200
        data = resp.json()
        assert data["stats"]["total"] == 0

    def test_overview_with_data(self, client):
        client.post("/api/tasks/review", json={"task_text": "Topic A"})
        client.post("/api/tasks/review", json={"task_text": "Topic B"})
        resp = client.get("/api/tasks/reviews/overview")
        data = resp.json()
        assert data["stats"]["learning"] >= 2
        assert "reviewing" in data
        assert "graduated" in data
