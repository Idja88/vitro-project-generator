"""Истёкший токен: Vitro-CAD отвечает 401 → генератор отвечает 401 «сессия истекла» и сбрасывает cookie."""

import pytest
import responses

from tests.fakes import mark, matrix, obj
from vitro_generator import vitro_cad_api as vc
from vitro_generator.vitro_cad_api import VitroAuthError

EXPIRED = "Сессия Vitro-CAD истекла. Откройте генератор заново из карточки проекта в Vitro-CAD."


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("get", "/api/v1/projects/P1", None),
        ("get", "/api/v1/marks", None),
        ("get", "/api/v1/objects?parent=SITE", None),
        ("get", "/api/v1/projects/P1/f10", None),
        ("post", "/api/v1/projects/P1/structure", matrix([obj("O1", "Корпус", [mark("M1", "АР")])])),
    ],
)
def test_expired_token_returns_401_and_clears_cookie(auth_client, vitro_factory, log_capture, method, path, body):
    vitro_factory(unauthorized=True)

    response = getattr(auth_client, method)(path, json=body)

    assert response.status_code == 401
    assert response.get_json() == {"error": EXPIRED}
    cookie = response.headers["Set-Cookie"]
    assert cookie.startswith("mp_token=;") and "Max-Age=0" in cookie
    assert any(r["level"].name == "WARNING" and "отклонил токен" in r["message"] for r in log_capture)


def test_expired_token_is_not_reported_as_missing_project(auth_client, vitro_factory):
    """Раньше 401 от Vitro-CAD превращался в «Проект не найден» (404)."""
    vitro_factory(unauthorized=True)
    assert auth_client.get("/api/v1/projects/P1").status_code != 404


# --- клиент Vitro-CAD ---

BASE = "http://vitro.test"


@pytest.fixture
def ctx(app):
    with app.app_context():
        yield


@pytest.mark.parametrize(
    "call, url",
    [
        (lambda: vc.get_mp_item("T", "X"), f"{BASE}/api/item/get/X"),
        (lambda: vc.get_mp_children("T", "X"), f"{BASE}/api/item/getList/X"),
        (lambda: vc.update_mp_list("T", [{}]), f"{BASE}/api/item/update"),
        (lambda: vc.copy_mp_item("T", "X", []), f"{BASE}/api/item/copy/X"),
        (lambda: vc.delete_mp_item("T", []), f"{BASE}/api/item/delete"),
        (lambda: vc.restore_mp_item("T", "X"), f"{BASE}/api/item/restore/X"),
        (lambda: vc.set_mp_item_unique_permission("T", {}), f"{BASE}/api/security/setItemUniquePermission"),
    ],
)
def test_client_raises_on_401(ctx, call, url):
    with responses.RequestsMock() as rsps:
        rsps.add(responses.POST, url, status=401)
        with pytest.raises(VitroAuthError):
            call()


def test_client_keeps_returning_none_on_other_errors(ctx):
    with responses.RequestsMock() as rsps:
        rsps.add(responses.POST, f"{BASE}/api/item/get/X", status=500)
        assert vc.get_mp_item("T", "X") is None


def test_login_with_bad_credentials_is_not_a_session_error(ctx):
    """get_mp_token (dev-автологин) на 401 возвращает None, а не VitroAuthError."""
    with responses.RequestsMock() as rsps:
        rsps.add(responses.POST, f"{BASE}/api/security/login", status=401)
        assert vc.get_mp_token() is None
