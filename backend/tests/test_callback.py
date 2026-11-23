"""Tier 3: POST /callback — точка входа из Vitro-CAD («Вызов внешнего сервиса»)."""

import pytest


def test_missing_authorization_header(client):
    response = client.post("/callback", json={"itemIdList": ["P1"]})

    assert response.status_code == 401
    assert response.get_json() == {"exception": {"message": "Отсутствует заголовок Authorization"}}


@pytest.mark.parametrize("body", [{}, {"itemIdList": []}, {"other": 1}])
def test_missing_item_id_list(client, body):
    response = client.post("/callback", json=body, headers={"Authorization": "TOK"})

    assert response.status_code == 400
    assert "Ожидается itemIdList" in response.get_json()["exception"]["message"]


def test_more_than_one_item_id(client):
    response = client.post("/callback", json={"itemIdList": ["A", "B"]}, headers={"Authorization": "TOK"})

    assert response.status_code == 400
    assert "один элемент" in response.get_json()["exception"]["message"]


def test_success_sets_cookie_and_redirect_header(client):
    response = client.post("/callback", json={"itemIdList": ["P1"]}, headers={"Authorization": "TOK"})

    assert response.status_code == 200
    assert response.headers["Link-Open-New-Tab"].endswith("/P1")
    assert response.headers["Access-Control-Allow-Origin"] == "http://vitro.test"
    assert response.headers["Access-Control-Expose-Headers"] == "Link-Open, Link-Open-New-Tab"

    cookie = response.headers["Set-Cookie"]
    assert cookie.startswith("mp_token=TOK;")
    assert "HttpOnly" in cookie
    assert "Max-Age=86400" in cookie
    assert "SameSite=Lax" in cookie
    assert "Secure" not in cookie, "вне production cookie не должна быть Secure"


def test_cookie_lifetime_is_fixed_to_one_day(client):
    response = client.post("/callback", json={"itemIdList": ["P1"]}, headers={"Authorization": "TOK"})

    assert "Max-Age=86400" in response.headers["Set-Cookie"]


def test_token_from_callback_cookie_is_accepted_by_protected_routes(client, vitro):
    client.post("/callback", json={"itemIdList": ["P1"]}, headers={"Authorization": "TOK"})
    response = client.get("/get/marks")

    assert response.status_code == 200
