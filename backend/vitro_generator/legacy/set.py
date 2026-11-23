"""Старые маршруты /set/* для jQuery-фронтенда. Удаляются после перехода на React (/api/v1)."""

from flask import Blueprint, jsonify, request

from vitro_generator.api import run_apply_matrix
from vitro_generator.auth import require_token

bp = Blueprint("set", __name__, url_prefix="/set")


@bp.route("/create/<project_id>", methods=["POST"])
@require_token
def create_project_structure(token, project_id):
    return run_apply_matrix(token, project_id)


# Заглушка: возвращает входные данные без изменений (используется старым фронтендом)
@bp.route("/update/<project_id>", methods=["POST"])
@require_token
def update_project_structure(token, project_id):
    return jsonify(request.get_json()), 201
