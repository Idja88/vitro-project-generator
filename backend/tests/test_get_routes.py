"""Tier 3: /get/* — read-only прокси к Vitro-CAD."""
import pytest

from vitro_generator import vitro_cad_api


def test_objects_filters_by_content_type_recursively(auth_client, vitro):
    response = auth_client.get("/get/objects/PARENT-1")

    assert response.status_code == 200
    assert response.get_json() == []
    (call,) = vitro.calls_of("get_mp_children")
    assert call[1] == "PARENT-1"
    assert call[2] is True
    assert call[3] == 'item => item.ContentTypeId == Guid("CT-OBJ")'


def test_marks_lists_mark_registry(auth_client, vitro):
    response = auth_client.get("/get/marks")

    assert response.status_code == 200
    assert response.get_json()[0]["id"] == "M1"
    (call,) = vitro.calls_of("get_mp_children")
    assert call[1:] == ("L-MARK", False, None)


def test_mark_by_id(auth_client, vitro):
    response = auth_client.get("/get/marks/M-77")

    assert response.status_code == 200
    assert response.get_json()["id"] == "M-77"
    assert vitro.calls_of("get_mp_item") == [("get_mp_item", "M-77")]


def test_projects_lists_project_registry(auth_client, vitro):
    response = auth_client.get("/get/projects")

    assert response.status_code == 200
    (call,) = vitro.calls_of("get_mp_children")
    assert call[1:] == ("L-PROJ", False, None)


def test_project_by_id_passes_payload_through(auth_client, monkeypatch):
    project = {"id": "P1", "fieldValueMap": {"selection_matrix": {"objects": []}}}
    monkeypatch.setattr(vitro_cad_api, "get_mp_item", lambda token, item_id, query=None: project)

    response = auth_client.get("/get/projects/P1")

    assert response.status_code == 200
    assert response.get_json() == project


@pytest.mark.parametrize("path", ["/get/objects/X", "/get/marks", "/get/projects"])
def test_children_failure_returns_500(auth_client, monkeypatch, path):
    monkeypatch.setattr(vitro_cad_api, "get_mp_children", lambda *args, **kwargs: None)

    response = auth_client.get(path)

    assert response.status_code == 500
    assert "Не удалось получить" in response.get_json()["error"]


@pytest.mark.parametrize("path", ["/get/marks/M1", "/get/projects/P1"])
def test_item_failure_returns_500(auth_client, vitro_factory, path):
    vitro_factory(get_item_none=True)

    response = auth_client.get(path)

    assert response.status_code == 500
    assert "Не удалось получить" in response.get_json()["error"]


@pytest.mark.parametrize("path", ["/get/objects/X", "/get/marks", "/get/marks/M1", "/get/projects", "/get/projects/P1"])
def test_all_routes_require_token(client, vitro, prod_env, path):
    assert client.get(path).status_code == 401
    assert vitro.calls == []
