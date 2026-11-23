from flask import Blueprint, jsonify, current_app
from vitro_generator import vitro_cad_api as vc
from vitro_generator.auth import require_token

bp = Blueprint('get', __name__, url_prefix='/get')

# Получает список объектов проектирования по ID родителя (1 или 2 уровень иерархии)
@bp.route('/objects/<parent_id>', methods=['GET'])
@require_token
def get_objects(token, parent_id):
    object_ct_id = current_app.config['OBJECT_CT_ID'] # content_type_id для папок Объектов Проектирования

    query_filter = f"item => item.ContentTypeId == Guid(\"{object_ct_id}\")" # Фильтр по content_type_id

    object_data = vc.get_mp_children(token, parent_id, recursive=True, query=query_filter) # Используем get_mp_children с фильтром и parent_id

    if object_data is None:
        return jsonify({"error": "Не удалось получить список объектов проектирования из Vitro-CAD MP"}), 500

    return jsonify(object_data)

# Получает список марок комплектов из Vitro-CAD MP
@bp.route('/marks', methods=['GET'])
@require_token
def get_marks(token):

    mark_list_id = current_app.config['MARK_LIST_ID'] # parentId для списка "Марки комплектов"

    mark_data = vc.get_mp_children(token, mark_list_id, recursive=False) # Используем get_mp_children для получения списка

    if mark_data is None:
        return jsonify({"error": "Не удалось получить список марок комплектов из Vitro-CAD MP"}), 500

    return jsonify(mark_data)

# Получаем информацию о марке по конкретному ID из Vitro-CAD MP
@bp.route('/marks/<mark_id>', methods=['GET'])
@require_token
def get_mark_info(token, mark_id):

    mark_data = vc.get_mp_item(token, mark_id) # Используем get_mp_item для получения данных ОДНОЙ марки по ID

    if mark_data is None:
        return jsonify({"error": "Не удалось получить данные марки из Vitro-CAD MP"}), 500

    return jsonify(mark_data)

# Получает список проектов из Vitro-CAD MP
@bp.route('/projects', methods=['GET'])
@require_token
def get_projects(token):

    project_list_id = current_app.config['PROJECT_LIST_ID'] # parentId для списка "Реестр Проектов"

    project_data = vc.get_mp_children(token, project_list_id, recursive=False) # Используем get_mp_children для получения списка

    if project_data is None:
        return jsonify({"error": "Не удалось получить список проектов из Vitro-CAD MP"}), 500

    return jsonify(project_data)

# Получает проект по конкретному ID из Vitro-CAD MP
@bp.route('/projects/<project_id>', methods=['GET'])
@require_token
def get_project_info(token, project_id):

    project_data = vc.get_mp_item(token, project_id) # Используем get_mp_item для получения данных ОДНОГО проекта по ID

    if project_data is None:
        return jsonify({"error": "Не удалось получить данные проекта из Vitro-CAD MP"}), 500

    return jsonify(project_data) # Возвращаем все данные проекта, включая selection_matrix