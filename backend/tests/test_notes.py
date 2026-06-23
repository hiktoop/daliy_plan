"""Integration tests for /api/diary, /api/folders, /api/notes endpoints."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class TestDiary:
    def test_get_nonexistent_diary(self, client):
        resp = client.get("/api/diary/2026-06-23")
        assert resp.status_code == 200
        data = resp.json()
        assert data["exists"] is False
        assert data["content"] == ""

    def test_save_and_get_diary(self, client):
        client.post("/api/diary/2026-06-23", json={"content": "Today was great."})
        resp = client.get("/api/diary/2026-06-23")
        data = resp.json()
        assert data["exists"] is True
        assert data["content"] == "Today was great."

    def test_update_diary(self, client):
        client.post("/api/diary/2026-06-24", json={"content": "V1"})
        client.post("/api/diary/2026-06-24", json={"content": "V2"})
        resp = client.get("/api/diary/2026-06-24")
        assert resp.json()["content"] == "V2"

    def test_delete_diary(self, client):
        client.post("/api/diary/2026-06-25", json={"content": "Delete me"})
        client.delete("/api/diary/2026-06-25")
        resp = client.get("/api/diary/2026-06-25")
        assert resp.json()["exists"] is False

    def test_invalid_date_format(self, client):
        resp = client.get("/api/diary/not-a-date")
        assert resp.json()["error"]


class TestFolders:
    def test_create_and_list_folder(self, client):
        client.post("/api/folders", json={"id": "f001", "name": "Work"})
        resp = client.get("/api/folders/tree")
        tree = resp.json()["tree"]
        assert len(tree) == 1
        assert tree[0]["name"] == "Work"

    def test_nested_folders(self, client):
        client.post("/api/folders", json={"id": "f001", "name": "Parent"})
        client.post("/api/folders", json={"id": "f002", "name": "Child", "parentId": "f001"})
        resp = client.get("/api/folders/tree")
        tree = resp.json()["tree"]
        parent = tree[0]
        assert len(parent["children"]) == 1
        assert parent["children"][0]["name"] == "Child"

    def test_rename_folder(self, client):
        client.post("/api/folders", json={"id": "f001", "name": "Old"})
        client.put("/api/folders/f001", json={"name": "New"})
        resp = client.get("/api/folders/tree")
        assert resp.json()["tree"][0]["name"] == "New"

    def test_prevent_circular_reference(self, client):
        client.post("/api/folders", json={"id": "f001", "name": "Parent"})
        client.post("/api/folders", json={"id": "f002", "name": "Child", "parentId": "f001"})
        resp = client.put("/api/folders/f001", json={"parentId": "f002"})
        assert resp.json()["error"] == "cannot move folder into its own descendant"

    def test_delete_folder_cascades(self, client):
        client.post("/api/folders", json={"id": "f001", "name": "Parent"})
        client.post("/api/folders", json={"id": "f002", "name": "Child", "parentId": "f001"})
        client.delete("/api/folders/f001")
        resp = client.get("/api/folders/tree")
        assert resp.json()["tree"] == []


class TestNotes:
    def test_create_and_get_note(self, client):
        resp = client.post("/api/notes", json={
            "id": "n001", "title": "My Note", "content": "Hello world",
            "tags": ["python", "tips"]
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        note = client.get("/api/notes/n001").json()
        assert note["title"] == "My Note"
        assert note["content"] == "Hello world"
        assert "python" in note["tags"]

    def test_list_notes(self, client):
        client.post("/api/notes", json={"id": "n001", "title": "Note A", "content": "A"})
        client.post("/api/notes", json={"id": "n002", "title": "Note B", "content": "B"})
        resp = client.get("/api/notes")
        assert len(resp.json()["notes"]) == 2

    def test_list_notes_by_folder(self, client):
        client.post("/api/folders", json={"id": "f001", "name": "Work"})
        client.post("/api/notes", json={"id": "n001", "title": "A", "folderId": "f001"})
        client.post("/api/notes", json={"id": "n002", "title": "B"})
        resp = client.get("/api/notes?folderId=f001")
        assert len(resp.json()["notes"]) == 1

    def test_search_notes(self, client):
        client.post("/api/notes", json={"id": "n001", "title": "Python", "content": "learning"})
        client.post("/api/notes", json={"id": "n002", "title": "Java", "content": "something"})
        resp = client.get("/api/notes?q=Python")
        assert len(resp.json()["notes"]) == 1

    def test_update_note(self, client):
        client.post("/api/notes", json={"id": "n001", "title": "Old"})
        client.put("/api/notes/n001", json={"title": "New", "content": "Updated"})
        note = client.get("/api/notes/n001").json()
        assert note["title"] == "New"
        assert note["content"] == "Updated"

    def test_delete_note(self, client):
        client.post("/api/notes", json={"id": "n001", "title": "Delete me"})
        client.delete("/api/notes/n001")
        resp = client.get("/api/notes/n001")
        assert resp.json()["error"] == "not found"

    def test_note_in_folder_tree(self, client):
        client.post("/api/folders", json={"id": "f001", "name": "Work"})
        client.post("/api/notes", json={"id": "n001", "title": "Task list", "folderId": "f001"})
        tree = client.get("/api/folders/tree").json()["tree"]
        assert len(tree[0]["notes"]) == 1
        assert tree[0]["notes"][0]["title"] == "Task list"


class TestSearch:
    def test_full_text_search(self, client):
        client.post("/api/diary/2026-06-23", json={"content": "Today I studied Python"})
        client.post("/api/notes", json={"id": "n001", "title": "Python Notes", "content": "Decorators"})
        resp = client.get("/api/notes/search?q=Python")
        data = resp.json()
        assert len(data["diary"]) >= 1
        assert len(data["notes"]) >= 1

    def test_search_no_results(self, client):
        resp = client.get("/api/notes/search?q=zzzz_not_found")
        data = resp.json()
        assert data["diary"] == []
        assert data["notes"] == []
