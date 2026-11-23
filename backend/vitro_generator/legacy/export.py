"""Старый маршрут /export/excel/* для jQuery-фронтенда. Удаляется после перехода на React (/api/v1)."""

from flask import Blueprint

from vitro_generator.api import send_f10
from vitro_generator.auth import require_token

bp = Blueprint("export", __name__, url_prefix="/export")


@bp.route("/excel/<project_id>", methods=["GET"])
@require_token
def export_project_to_excel(token, project_id):
    return send_f10(token, project_id)
