"""Tier 4: vitro_cad_api — HTTP-контракт с Vitro-CAD MP (мок на уровне requests через `responses`)."""

import json

import pytest
import requests
import responses

from vitro_generator import vitro_cad_api as vc

BASE = "http://vitro.test"


@pytest.fixture
def ctx(app):
    with app.app_context():
        yield


@pytest.fixture
def rsps():
    with responses.RequestsMock() as mock:
        yield mock


def body_text(request):
    body = request.body
    return body.decode("utf-8") if isinstance(body, bytes) else body


# --- update_mp_list: multipart/form-data с частью itemListJson ---


def test_update_mp_list_sends_multipart_item_list_json(ctx, rsps):
    rsps.add(responses.POST, f"{BASE}/api/item/update", json=[{"id": "N1"}])
    payload = [{"list_id": "L", "name": "АТХ", "sheet_set_number": 1}]

    result = vc.update_mp_list("TOK", payload)

    assert result == [{"id": "N1"}]
    request = rsps.calls[0].request
    assert request.headers["Authorization"] == "TOK"
    assert request.headers["Content-Type"].startswith("multipart/form-data; boundary=")
    body = body_text(request)
    assert 'name="itemListJson"' in body
    assert "filename=" not in body, "itemListJson — текстовое поле формы, не файл"
    part_json = body.split("\r\n\r\n", 1)[1].split("\r\n--", 1)[0]
    assert json.loads(part_json) == payload


def test_update_mp_list_returns_none_on_server_error(ctx, rsps):
    rsps.add(responses.POST, f"{BASE}/api/item/update", status=500, json={"message": "Multipart boundary not found."})

    assert vc.update_mp_list("TOK", [{"name": "x"}]) is None


# --- get_mp_item ---


def test_get_mp_item_without_query_has_no_body(ctx, rsps):
    rsps.add(responses.POST, f"{BASE}/api/item/get/ID-1", json={"id": "ID-1"})

    assert vc.get_mp_item("TOK", "ID-1") == {"id": "ID-1"}
    assert rsps.calls[0].request.body in (None, b"", "")


def test_get_mp_item_with_query_sends_json(ctx, rsps):
    rsps.add(responses.POST, f"{BASE}/api/item/get/ID-1", json={"id": "ID-1"})

    vc.get_mp_item("TOK", "ID-1", query="item => true")

    assert json.loads(body_text(rsps.calls[0].request)) == {"query": "item => true"}


@pytest.mark.parametrize("kwargs", [{"body": "null"}, {"json": {}}, {"status": 404, "json": {}}])
def test_get_mp_item_empty_or_failed_returns_none(ctx, rsps, kwargs):
    rsps.add(responses.POST, f"{BASE}/api/item/get/ID-1", **kwargs)

    assert vc.get_mp_item("TOK", "ID-1") is None


# --- get_mp_children ---


@pytest.mark.parametrize("recursive, endpoint", [(False, "getList"), (True, "getRecursive")])
def test_get_mp_children_picks_endpoint(ctx, rsps, recursive, endpoint):
    rsps.add(responses.POST, f"{BASE}/api/item/{endpoint}/PARENT", json=[{"id": "c1"}])

    result = vc.get_mp_children("TOK", "PARENT", recursive=recursive, query='item => item.Id == Guid("x")')

    assert result == [{"id": "c1"}]
    assert json.loads(body_text(rsps.calls[0].request)) == {"query": 'item => item.Id == Guid("x")'}


def test_get_mp_children_returns_none_on_error(ctx, rsps):
    rsps.add(responses.POST, f"{BASE}/api/item/getList/PARENT", status=500)

    assert vc.get_mp_children("TOK", "PARENT") is None


# --- copy / restore / permission: True при успехе, None при ошибке ---

ACTIONS = [
    ("copy_mp_item", f"{BASE}/api/item/copy/TARGET", ("TOK", "TARGET", [{"id": "t"}])),
    ("restore_mp_item", f"{BASE}/api/item/restore/BIN-1", ("TOK", "BIN-1")),
    (
        "set_mp_item_unique_permission",
        f"{BASE}/api/security/setItemUniquePermission",
        ("TOK", {"id": "F", "copy_permission": True}),
    ),
]


@pytest.mark.parametrize("func_name, url, args", ACTIONS)
def test_actions_return_true_on_success(ctx, rsps, func_name, url, args):
    rsps.add(responses.POST, url, status=200)

    assert getattr(vc, func_name)(*args) is True
    assert rsps.calls[0].request.headers["Authorization"] == "TOK"


@pytest.mark.parametrize("func_name, url, args", ACTIONS)
def test_actions_return_none_on_error(ctx, rsps, func_name, url, args):
    rsps.add(responses.POST, url, status=500)

    assert getattr(vc, func_name)(*args) is None


def test_copy_mp_item_sends_template_list_as_json(ctx, rsps):
    rsps.add(responses.POST, f"{BASE}/api/item/copy/TARGET", status=200)
    template = [{"id": "t1", "isChildListCopyRequired": True}]

    vc.copy_mp_item("TOK", "TARGET", template)

    assert json.loads(body_text(rsps.calls[0].request)) == template


# --- delete ---


def test_delete_mp_item_passes_response_through(ctx, rsps):
    rsps.add(responses.POST, f"{BASE}/api/item/delete", json=[{"id": "F1"}])

    assert vc.delete_mp_item("TOK", [{"id": "F1"}]) == [{"id": "F1"}]
    assert json.loads(body_text(rsps.calls[0].request)) == [{"id": "F1"}]


# --- login ---


def test_get_mp_token_posts_admin_credentials(ctx, rsps):
    rsps.add(responses.POST, f"{BASE}/api/security/login", json={"token": "ADMIN-TOKEN"})

    assert vc.get_mp_token() == "ADMIN-TOKEN"
    assert json.loads(body_text(rsps.calls[0].request)) == {"login": "admin", "password": "secret"}


def test_get_mp_token_returns_none_on_invalid_credentials(ctx, rsps):
    rsps.add(
        responses.POST, f"{BASE}/api/security/login", status=500, json={"message": "InvalidLoginPasswordException"}
    )

    assert vc.get_mp_token() is None


# --- сетевые сбои и таймаут ---


def test_connection_error_returns_none(ctx, rsps, log_capture):
    rsps.add(responses.POST, f"{BASE}/api/item/update", body=requests.ConnectionError("boom"))

    assert vc.update_mp_list("TOK", [{"name": "x"}]) is None
    assert any(r["level"].name == "ERROR" and "update_mp_list" in r["message"] for r in log_capture)


def test_timeout_from_config_is_passed_to_requests(ctx, monkeypatch):
    seen = {}

    def fake_post(**kwargs):
        seen.update(kwargs)
        response = requests.Response()
        response.status_code = 200
        response._content = b"[]"
        return response

    monkeypatch.setattr(vc.requests, "post", fake_post)

    vc.get_mp_children("TOK", "X")

    assert seen["timeout"] == 30
    assert seen["headers"] == {"Authorization": "TOK"}
