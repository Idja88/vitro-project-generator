from flask import Blueprint, jsonify, current_app
import vitro_cad_api as vc

bp = Blueprint('data', __name__, url_prefix='/data')

# Получает список заказчиков
@bp.route('/customers', methods=['GET'])
def get_customers():
    token = vc.get_mp_token() # Получаем токен
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500

    parent_id = current_app.config['OBJECT_LIST_ID'] # ID родительского списка "Объекты Проектирования"
    customer_ct_id = current_app.config['CUSTOMER_CT_ID'] # content_type_id для папок Заказчиков

    query_filter = f"item => item.ContentTypeId == Guid(\"{customer_ct_id}\")" # Фильтр по content_type_id

    customer_data = vc.get_mp_children(token, parent_id, recursive=True, query=query_filter) # Используем get_mp_children с фильтром

    if customer_data is None:
        return jsonify({"error": "Не удалось получить список заказчиков из Vitro-CAD MP"}), 500

    return jsonify(customer_data) # Возвращаем данные в JSON

# Получает список объектов проектирования для конкретного заказчика
@bp.route('/objects/<customer_id>', methods=['GET'])
def get_objects_for_customer(customer_id):
    token = vc.get_mp_token()
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500

    object_ct_id = current_app.config['OBJECT_CT_ID'] # content_type_id для папок Объектов Проектирования

    query_filter = f"item => item.ContentTypeId == Guid(\"{object_ct_id}\")" # Фильтр по content_type_id

    object_data = vc.get_mp_children(token, customer_id, recursive=True, query=query_filter) # Используем get_mp_children с фильтром и customer_id

    if object_data is None:
        return jsonify({"error": "Не удалось получить список объектов проектирования из Vitro-CAD MP"}), 500

    return jsonify(object_data)

# Получает список марок комплектов из Vitro-CAD MP
@bp.route('/marks', methods=['GET'])
def get_marks():
    token = vc.get_mp_token()
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500

    mark_list_id = current_app.config['MARK_LIST_ID'] # parentId для списка "Марки комплектов"

    mark_data = vc.get_mp_children(token, mark_list_id, recursive=False) # Используем get_mp_children для получения списка

    if mark_data is None:
        return jsonify({"error": "Не удалось получить список марок комплектов из Vitro-CAD MP"}), 500

    return jsonify(mark_data)

# Получает список проектов из Vitro-CAD MP
@bp.route('/projects', methods=['GET'])
def get_projects():
    token = vc.get_mp_token()
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500

    project_list_id = current_app.config['PROJECT_LIST_ID'] # parentId для списка "Реестр Проектов"

    query_filter = f"item => item.GetValueAsBool(\"is_created_by_generator\") == True" # Фильтр по флагу

    project_data = vc.get_mp_children(token, project_list_id, recursive=False, query=query_filter) # Используем get_mp_children для получения списка

    if project_data is None:
        return jsonify({"error": "Не удалось получить список проектов из Vitro-CAD MP"}), 500

    return jsonify(project_data)

# Получает проект по конкретному ID из Vitro-CAD MP
@bp.route('/projects/<project_id>', methods=['GET'])
def get_project_data(project_id):
    token = vc.get_mp_token()
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500

    query_filter = f"item => item.GetValueAsBool(\"is_created_by_generator\") == True" # Фильтр по флагу

    project_data = vc.get_mp_item(token, project_id, query=query_filter) # Используем get_mp_item для получения данных ОДНОГО проекта по ID

    if project_data is None:
        return jsonify({"error": "Не удалось получить данные проекта из Vitro-CAD MP"}), 500

    return jsonify(project_data) # Возвращаем все данные проекта, включая selection_matrix