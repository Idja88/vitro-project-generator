"""JSON API /api/v1 для React-фронтенда.

Ответы — компактные объекты в camelCase вместо сырых элементов Vitro-CAD; матрица выбора передаётся
в своём формате хранения (snake_case), потому что именно её фронтенд отправляет обратно.
"""

from flask import Blueprint, current_app, jsonify, request, send_file
from loguru import logger

from vitro_generator import vitro_cad_api as vc
from vitro_generator.auth import require_token
from vitro_generator.services.export_f10 import build_f10
from vitro_generator.services.matrix import lookup_name, parse_matrix, project_code, validate_matrix
from vitro_generator.services.preview import plan_actions
from vitro_generator.services.structure import VitroApiError, apply_matrix

bp = Blueprint("api_v1", __name__, url_prefix="/api/v1")

XLSX_MIMETYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# --- преобразование элементов Vitro-CAD ---


def _field(item, name):
    return (item.get("fieldValueMap") or {}).get(name)


def project_dto(item):
    fields = item.get("fieldValueMap") or {}
    site = fields.get("object_list_lookup_tree") or {}
    raw_matrix = fields.get("selection_matrix")
    return {
        "id": item["id"],
        "name": fields.get("name"),
        "code": project_code(fields),
        "chief": lookup_name(fields, "chief_project_engineer"),
        "objectParentId": site.get("id"),
        "isGenerated": bool(fields.get("is_created_by_generator")),
        "matrix": parse_matrix(raw_matrix) if raw_matrix else None,
    }


def object_dto(item):
    number = _field(item, "object_plan_number")
    return {"id": item["id"], "name": _field(item, "name"), "number": "" if number is None else str(number)}


def mark_dto(item):
    return {"id": item["id"], "code": _field(item, "code"), "name": _field(item, "name")}


def _list_url(list_id):
    base = current_app.config.get("VITRO_CAD_API_BASE_URL")
    return f"{base}/list/{list_id}" if base and list_id else None


# --- общие обработчики (их же используют старые маршруты legacy/) ---


def run_apply_matrix(token, project_id):
    """Валидация матрицы, применение к СХД, ошибки → JSON {"error": ...}."""
    request_data = request.get_json(silent=True)
    errors = validate_matrix(request_data)
    if errors:
        logger.warning("Матрица проекта {} отклонена: {}", project_id, errors)
        return jsonify({"error": "; ".join(errors)}), 400

    try:
        return jsonify(apply_matrix(token, request_data)), 201
    except VitroApiError as e:
        logger.error("Ошибка Vitro-CAD при создании структуры проекта {}: {}", project_id, e)
        return jsonify({"error": str(e)}), 500
    except Exception:
        logger.exception("Непредвиденная ошибка при создании структуры проекта {}", project_id)
        return jsonify({"error": "Не удалось создать структуру проекта"}), 500


def send_f10(token, project_id):
    """Ф10 в Excel по матрице проекта."""
    try:
        project = vc.get_mp_item(token, project_id)
        if not project:
            return jsonify({"error": "Проект не найден"}), 404
        if project["fieldValueMap"].get("selection_matrix") is None:
            return jsonify({"error": "Матрица выбора отсутствует"}), 400

        buffer, filename = build_f10(token, project)
        return send_file(buffer, as_attachment=True, download_name=filename, mimetype=XLSX_MIMETYPE)
    except Exception as e:
        logger.exception("Ошибка экспорта Ф10 для проекта {}", project_id)
        return jsonify({"error": str(e)}), 500


def _vitro_error(message):
    return jsonify({"error": message}), 502


# --- маршруты ---


@bp.get("/config")
@require_token
def get_config(token):
    """Настройки для фронтенда: ссылки на реестры объектов и марок в Vitro-CAD."""
    return jsonify(
        {
            "vitroBaseUrl": current_app.config.get("VITRO_CAD_API_BASE_URL"),
            "objectListUrl": _list_url(current_app.config.get("OBJECT_LIST_ID")),
            "markListUrl": _list_url(current_app.config.get("MARK_LIST_ID")),
        }
    )


@bp.get("/projects/<project_id>")
@require_token
def get_project(token, project_id):
    item = vc.get_mp_item(token, project_id)
    if item is None:
        return jsonify({"error": "Проект не найден"}), 404
    return jsonify(project_dto(item))


@bp.get("/objects")
@require_token
def get_objects(token):
    """Объекты проектирования площадки: ?parent=<id> (object_list_lookup_tree проекта)."""
    parent_id = request.args.get("parent")
    if not parent_id:
        return jsonify({"error": "Не указан параметр parent"}), 400
    query = f'item => item.ContentTypeId == Guid("{current_app.config["OBJECT_CT_ID"]}")'
    items = vc.get_mp_children(token, parent_id, recursive=True, query=query)
    if items is None:
        return _vitro_error("Не удалось получить список объектов проектирования из Vitro-CAD MP")
    return jsonify([object_dto(item) for item in items])


@bp.get("/marks")
@require_token
def get_marks(token):
    items = vc.get_mp_children(token, current_app.config["MARK_LIST_ID"], recursive=False)
    if items is None:
        return _vitro_error("Не удалось получить список марок комплектов из Vitro-CAD MP")
    return jsonify([mark_dto(item) for item in items])


@bp.post("/projects/<project_id>/structure/preview")
@require_token
def preview_structure(token, project_id):
    """Список действий, которые выполнит создание структуры. Vitro-CAD не вызывается."""
    data = request.get_json(silent=True)
    errors = validate_matrix(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    return jsonify(plan_actions(data))


@bp.post("/projects/<project_id>/structure")
@require_token
def create_structure(token, project_id):
    return run_apply_matrix(token, project_id)


@bp.get("/projects/<project_id>/f10")
@require_token
def export_f10(token, project_id):
    return send_f10(token, project_id)
