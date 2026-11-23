"""Tier 3: create_app — выбор конфигурации, production-обёртки, рендер страницы."""

import pytest
from werkzeug.middleware.proxy_fix import ProxyFix

from vitro_generator import create_app
from vitro_generator.middleware import PrefixMiddleware

PROD_BASE = "https://example.test"


@pytest.fixture
def prod_app(monkeypatch):
    monkeypatch.setenv("FLASK_CONFIG", "prod")
    return create_app()


def test_production_wraps_proxyfix_and_prefix_middleware(prod_app):
    assert prod_app.debug is False
    assert prod_app.config["FLASK_CONFIG"] == "prod"
    assert isinstance(prod_app.wsgi_app, PrefixMiddleware)
    assert prod_app.wsgi_app.prefix == "/generator"
    assert isinstance(prod_app.wsgi_app.app, ProxyFix)
    assert prod_app.config["SESSION_COOKIE_PATH"] == "/generator"
    assert prod_app.config["SESSION_COOKIE_SECURE"] is True
    assert prod_app.config["SERVER_NAME"] == "example.test"


def test_production_callback_through_nginx_prefix(prod_app):
    client = prod_app.test_client()
    response = client.post(
        "/generator/callback",
        base_url=PROD_BASE,
        json={"itemIdList": ["P1"]},
        headers={"Authorization": "TOK"},
    )

    assert response.status_code == 200
    assert response.headers["Link-Open-New-Tab"] == f"{PROD_BASE}/generator/project/P1"
    assert "Secure" in response.headers["Set-Cookie"]


def test_production_request_outside_prefix_is_404(prod_app):
    client = prod_app.test_client()
    response = client.get("/other", base_url=PROD_BASE)

    assert response.status_code == 404
    assert response.data == b"This URL does not belong to the app."


def test_production_callback_without_prefix_is_404(prod_app):
    client = prod_app.test_client()
    response = client.post(
        "/callback", base_url=PROD_BASE, json={"itemIdList": ["P1"]}, headers={"Authorization": "TOK"}
    )

    assert response.status_code == 404


def test_development_is_not_wrapped(monkeypatch):
    monkeypatch.setenv("FLASK_CONFIG", "dev")
    dev_app = create_app()

    assert dev_app.debug is True
    assert dev_app.config["FLASK_CONFIG"] == "dev"
    assert not isinstance(dev_app.wsgi_app, PrefixMiddleware)


def test_testing_config_selected(app):
    assert app.testing is True
    assert app.config["FLASK_CONFIG"] == "test"
    assert app.config["VITRO_CAD_API_BASE_URL"] == "http://vitro.test"
    assert app.config["VITRO_CAD_API_TIMEOUT"] == 30
    assert "VITRO_CAD_AUTH_TOKEN" not in app.config, "админ-токен в конфиге больше не поддерживается"


def test_production_has_no_dev_autologin(prod_app, vitro):
    client = prod_app.test_client()
    response = client.get("/generator/project/P1", base_url=PROD_BASE)

    assert response.status_code == 401
    assert vitro.calls_of("get_mp_token") == []


def test_index_requires_token(client, vitro, prod_env):
    assert client.get("/project/P1").status_code == 401


def test_healthz_without_auth(client, prod_env):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_healthz_behind_prefix(prod_app):
    response = prod_app.test_client().get("/generator/healthz", base_url=PROD_BASE)
    assert response.status_code == 200
