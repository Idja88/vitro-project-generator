"""Раздача собранного React-фронтенда (frontend/dist).

index.html отдаётся на /project/<id> с префиксом приложения в <base href>: сборка использует
относительные пути, поэтому ассеты и /api/v1 находятся и локально (/), и за nginx (/generator/).
Если сборки нет, /project/<id> отвечает 503 с подсказкой собрать фронтенд.
"""

import os
from functools import cache

from flask import Blueprint, Response, abort, current_app, request, send_from_directory

from vitro_generator.auth import require_token

bp = Blueprint("frontend", __name__)

BASE_TAG = '<base href="/" />'


def dist_dir():
    return current_app.config["FRONTEND_DIST"]


@cache
def _read_index(path, mtime):  # mtime в ключе кэша: пересборка фронтенда подхватывается без перезапуска
    with open(path, encoding="utf-8") as f:
        return f.read()


def react_index():
    """Текст index.html сборки или None, если фронтенд не собран."""
    path = os.path.join(dist_dir(), "index.html")
    if not os.path.isfile(path):
        return None
    return _read_index(path, os.path.getmtime(path))


@bp.route("/project/<project_id>")
@require_token
def index(token, project_id):
    html = react_index()
    if html is None:
        return Response(
            "Фронтенд не собран: выполните npm run build в каталоге frontend/ (или задайте FRONTEND_DIST).",
            status=503,
            mimetype="text/plain",
        )
    # request.script_root — префикс за PrefixMiddleware ("/generator") или "" локально
    return Response(html.replace(BASE_TAG, f'<base href="{request.script_root}/" />', 1), mimetype="text/html")


@bp.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(os.path.join(dist_dir(), "assets"), filename, max_age=365 * 24 * 3600)


@bp.route("/favicon.ico")
def favicon():
    if not os.path.isfile(os.path.join(dist_dir(), "favicon.ico")):
        abort(404)
    return send_from_directory(dist_dir(), "favicon.ico")
