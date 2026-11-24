"""Раздача сборки React: index.html с префиксом в <base href>, ассеты, ошибка без сборки."""

import pytest

from vitro_generator import create_app

INDEX = (
    '<!doctype html><html><head><base href="/" />'
    '<script type="module" src="./assets/index-abc.js"></script></head><body><div id="root"></div></body></html>'
)


@pytest.fixture
def dist(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text(INDEX, encoding="utf-8")
    (tmp_path / "assets" / "index-abc.js").write_text("console.log('app')", encoding="utf-8")
    (tmp_path / "favicon.ico").write_bytes(bytes([0, 0, 1, 0]))  # заголовок ICO
    return tmp_path


@pytest.fixture
def react_client(app, dist, monkeypatch):
    monkeypatch.setitem(app.config, "FRONTEND_DIST", str(dist))
    client = app.test_client()
    client.set_cookie("mp_token", "T")
    return client


def test_project_page_serves_react_index(react_client):
    response = react_client.get("/project/P1")
    html = response.data.decode("utf-8")

    assert response.status_code == 200
    assert response.mimetype == "text/html"
    assert '<div id="root">' in html
    assert '<base href="/" />' in html


def test_assets_and_favicon_are_served(react_client):
    asset = react_client.get("/assets/index-abc.js")
    assert asset.status_code == 200
    assert b"console.log" in asset.data
    assert "max-age=31536000" in asset.headers["Cache-Control"]
    assert react_client.get("/favicon.ico").status_code == 200
    assert react_client.get("/assets/missing.js").status_code == 404


def test_without_build_project_page_explains_how_to_build(auth_client):
    response = auth_client.get("/project/P1")

    assert response.status_code == 503
    assert "npm run build" in response.data.decode("utf-8")


def test_project_page_requires_token(client, vitro, prod_env):
    assert client.get("/project/P1").status_code == 401


def test_production_prefix_goes_into_base_href(dist, monkeypatch):
    monkeypatch.setenv("FLASK_CONFIG", "prod")
    monkeypatch.setenv("FRONTEND_DIST", str(dist))
    prod_app = create_app()
    prod_app.config["FRONTEND_DIST"] = str(dist)
    client = prod_app.test_client()
    client.set_cookie("mp_token", "T", domain="example.test")

    page = client.get("/generator/project/P1", base_url="https://example.test")
    asset = client.get("/generator/assets/index-abc.js", base_url="https://example.test")

    assert page.status_code == 200
    assert '<base href="/generator/" />' in page.data.decode("utf-8")
    assert asset.status_code == 200
