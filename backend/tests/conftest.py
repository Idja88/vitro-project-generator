"""Общие фикстуры.

ВАЖНО: переменные окружения выставляются ДО импорта `app`. Атрибуты `Config` вычисляются при импорте
через os.getenv, а load_dotenv() не перетирает уже заданные переменные, поэтому реальный .env
разработчика сюда не просачивается.
"""

import os

from tests.fakes import IDS, FakeVitro

TEST_ENV = {
    "FLASK_CONFIG": "test",
    "VITRO_CAD_API_BASE_URL": "http://vitro.test",
    "VITRO_CAD_ADMIN_USERNAME": "admin",
    "VITRO_CAD_ADMIN_PASSWORD": "secret",
    "VITRO_CAD_API_TIMEOUT": "30",
    "LOG_LEVEL": "DEBUG",
    "LOG_FILE": "",
    # нет сборки React: /project/<id> отвечает 503; test_frontend.py подставляет свою сборку
    "FRONTEND_DIST": os.path.join(os.path.dirname(__file__), "no-frontend-build"),
    # для production-режима (test_app_config.py)
    "SERVER_NAME": "example.test",
    "PREFIX": "/generator",
    "PROXY_COUNT": "1",
    **IDS,
}
for _key, _value in TEST_ENV.items():
    os.environ[_key] = _value

import pytest
from loguru import logger

from vitro_generator import (
    create_app,
    vitro_cad_api,
)


@pytest.fixture(scope="session")
def app():
    return create_app()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_client(app):
    """Клиент с cookie mp_token, как после /callback."""
    c = app.test_client()
    c.set_cookie("mp_token", "T")
    return c


@pytest.fixture
def vitro_factory(monkeypatch):
    """Фабрика: vitro_factory(anchor=False, ...) подменяет все функции vitro_cad_api и возвращает FakeVitro."""

    def install(**kwargs):
        fake = FakeVitro(**kwargs)
        for name in FakeVitro.FUNCTIONS:
            monkeypatch.setattr(vitro_cad_api, name, getattr(fake, name))
        return fake

    return install


@pytest.fixture
def vitro(vitro_factory):
    """FakeVitro с настройками по умолчанию: якорь есть, корзина находит папку, у марки два отдела."""
    return vitro_factory()


@pytest.fixture
def prod_env(app, monkeypatch):
    """Переключает FLASK_CONFIG в production на время теста: dev-автологин не срабатывает."""
    monkeypatch.setitem(app.config, "FLASK_CONFIG", "prod")


@pytest.fixture
def log_capture(app):
    """Список записей loguru за время теста (record['level'].name, record['message'])."""
    records = []
    sink_id = logger.add(lambda message: records.append(message.record), level="DEBUG")
    yield records
    logger.remove(sink_id)
