import os
from flask import Flask, render_template
from vitro_generator.config import configure_app
from vitro_generator import callback
from vitro_generator.legacy import set, get, export
from vitro_generator.auth import require_token
from werkzeug.middleware.proxy_fix import ProxyFix
from vitro_generator.middleware import PrefixMiddleware
from vitro_generator.logging_config import configure_logging
from loguru import logger


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

    @app.context_processor
    def inject_globals():
        prefix = os.getenv("PREFIX", "")
        object_list_id = os.getenv("OBJECT_LIST_ID", "")
        mark_list_id = os.getenv("MARK_LIST_ID", "")
        vitro_cad_api_base_url = os.getenv("VITRO_CAD_API_BASE_URL", "")
        return {
            "app_prefix": prefix,
            "object_list_id": object_list_id,
            "mark_list_id": mark_list_id,
            "vitro_cad_api_base_url": vitro_cad_api_base_url,
        }

    # Регистрируем Blueprints
    app.register_blueprint(set.bp)
    app.register_blueprint(get.bp)
    app.register_blueprint(callback.bp)
    app.register_blueprint(export.bp)

    if app.config.get("FLASK_CONFIG") != "prod" and app.config.get("VITRO_CAD_ADMIN_USERNAME"):
        logger.warning(
            "Среда {}: запросы без cookie будут авторизованы автологином под {}",
            app.config.get("FLASK_CONFIG"),
            app.config["VITRO_CAD_ADMIN_USERNAME"],
        )

    @app.route("/project/<project_id>")
    @require_token
    def index(token, project_id):
        return render_template("index.html", project_id=project_id)

    return app

