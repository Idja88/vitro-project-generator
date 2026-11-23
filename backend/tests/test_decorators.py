"""Tier 3: @require_token — источники токена и dev-автологин."""
import pytest

from vitro_generator import vitro_cad_api


@pytest.fixture
def seen_token(monkeypatch):
    """Подменяет get_mp_children и запоминает токен, с которым маршрут обратился к Vitro-CAD."""
    seen = {}

    def fake(token, *args, **kwargs):
        seen["token"] = token
        return []

    monkeypatch.setattr(vitro_cad_api, "get_mp_children", fake)
    return seen


def test_mp_token_cookie_has_priority(client, seen_token):
    client.set_cookie("mp_token", "FROM-CALLBACK")
    client.set_cookie("Authorization", "FROM-VITRO")
    response = client.get("/get/marks")

    assert response.status_code == 200
    assert seen_token["token"] == "FROM-CALLBACK"
    assert "Set-Cookie" not in response.headers, "при наличии cookie автологин не нужен"


def test_vitro_authorization_cookie_is_ignored(client, seen_token, vitro, prod_env):
    """Cookie Authorization самого Vitro-CAD намеренно не используется как источник токена."""
    client.set_cookie("Authorization", "FROM-VITRO")
    response = client.get("/get/marks")

    assert response.status_code == 401
    assert "token" not in seen_token


# --- production-поведение: FLASK_CONFIG=prod ---

def test_no_token_returns_401_in_production(client, seen_token, vitro, prod_env, log_capture):
    response = client.get("/get/marks")

    assert response.status_code == 401
    assert response.get_json() == {"message": "Отсутствует токен авторизации!"}
    assert "token" not in seen_token
    assert vitro.calls_of("get_mp_token") == [], "в production логин через API не вызывается"
    assert any(r["level"].name == "WARNING" and "/get/marks" in r["message"] for r in log_capture)


def test_no_config_token_fallback(client, app, seen_token, prod_env, monkeypatch):
    """Бывшее слабое место №6 закрыто: токен из конфига не подставляется."""
    monkeypatch.setitem(app.config, "VITRO_CAD_AUTH_TOKEN", "ADMIN")
    response = client.get("/get/marks")

    assert response.status_code == 401
    assert "token" not in seen_token


# --- dev-автологин: среда не production, учётные данные в конфиге ---

def test_dev_autologin_logs_in_and_sets_cookie(client, vitro, seen_token, log_capture):
    # порядок фикстур важен: seen_token должен подменить get_mp_children после установки vitro
    response = client.get("/get/marks")

    assert response.status_code == 200
    assert seen_token["token"] == "ADMIN-TOKEN"
    assert vitro.calls_of("get_mp_token") == [("get_mp_token",)]

    cookie = response.headers["Set-Cookie"]
    assert cookie.startswith("mp_token=ADMIN-TOKEN;")
    assert "HttpOnly" in cookie
    assert "Max-Age=86400" in cookie
    assert "Secure" not in cookie
    assert any("Dev-автологин" in r["message"] for r in log_capture if r["level"].name == "INFO")


def test_dev_autologin_cookie_is_reused_on_next_request(client, vitro):
    client.get("/get/marks")
    client.get("/get/marks")

    assert len(vitro.calls_of("get_mp_token")) == 1, "после первого запроса токен берётся из cookie"


def test_dev_autologin_failure_returns_401(client, vitro_factory, seen_token, log_capture):
    vitro_factory(login_ok=False)
    seen_token.clear()
    response = client.get("/get/marks")

    assert response.status_code == 401
    assert "token" not in seen_token
    assert any(r["level"].name == "ERROR" and "VITRO_CAD_ADMIN_USERNAME" in r["message"] for r in log_capture)


@pytest.mark.parametrize("missing", ["VITRO_CAD_ADMIN_USERNAME", "VITRO_CAD_ADMIN_PASSWORD"])
def test_dev_autologin_requires_credentials(client, app, vitro, monkeypatch, missing):
    monkeypatch.setitem(app.config, missing, None)
    response = client.get("/get/marks")

    assert response.status_code == 401
    assert vitro.calls_of("get_mp_token") == []


def test_dev_autologin_opens_generator_page(client, vitro):
    response = client.get("/project/P1")

    assert response.status_code == 200
    assert 'PROJECT_ID: "P1"' in response.data.decode("utf-8")
    assert "mp_token=ADMIN-TOKEN" in response.headers["Set-Cookie"]
