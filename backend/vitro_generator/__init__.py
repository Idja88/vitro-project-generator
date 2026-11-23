import os

from flask import Flask
from loguru import logger
from werkzeug.middleware.proxy_fix import ProxyFix

from vitro_generator import api, callback, frontend
from vitro_generator.config import configure_app
from vitro_generator.logging_config import configure_logging
from vitro_generator.middleware import PrefixMiddleware


def create_app():
    # Инициализация приложения
    app = Flask(__name__)

    # Конфигурируем приложение
    env = os.getenv("FLASK_CONFIG")  # dev | prod | test
    configure_app(app, env)

    # Единое логирование через loguru (перехватывает и Flask/Werkzeug)
    configure_logging(app)

    # Применяем ProxyFix для правильной обработки заголовков за прокси
    if env == "prod":
        proxy_count = int(os.getenv("PROXY_COUNT", 1))
        app.wsgi_app = ProxyFix(
            app.wsgi_app,
            x_for=proxy_count,
            x_proto=proxy_count,
            x_host=proxy_count,
            x_prefix=proxy_count,
        )

        # Применяем PrefixMiddleware только в production среде
        prefix = os.getenv("PREFIX", "")
        app.wsgi_app = PrefixMiddleware(app.wsgi_app, prefix=prefix)

        # Настройки для cookie с учетом префикса
        app.config["SESSION_COOKIE_PATH"] = prefix
        app.config["SESSION_COOKIE_SECURE"] = True

    # Регистрируем Blueprints
    app.register_blueprint(callback.bp)
    app.register_blueprint(api.bp)
    app.register_blueprint(frontend.bp)

    @app.get("/healthz")
    def healthz():
        """Проверка живости для Docker/nginx: без авторизации и без обращения к Vitro-CAD."""
        return {"status": "ok"}

    if app.config.get("FLASK_CONFIG") != "prod" and app.config.get("VITRO_CAD_ADMIN_USERNAME"):
        logger.warning(
            "Среда {}: запросы без cookie будут авторизованы автологином под {}",
            app.config.get("FLASK_CONFIG"),
            app.config["VITRO_CAD_ADMIN_USERNAME"],
        )

    return app
