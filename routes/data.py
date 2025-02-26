from flask import Blueprint, jsonify, current_app
from vitro_cad_api import get_mp_children, get_mp_token # Импортируй необходимые функции

bp = Blueprint('data', __name__, url_prefix='/data')

# Получает список заказчиков из Vitro-CAD MP
@bp.route('/customers', methods=['GET'])
def get_customers():
    token = get_mp_token() # Получаем токен
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500

    parent_id = current_app.config['OBJECTS_LIST_PARENT_ID'] # ID родительского списка "Объекты Проектирования"
    customer_folder_ct_id = current_app.config['CUSTOMER_FOLDER_CT_ID'] # content_type_id для папок Заказчиков

    query_filter = f"item => item.ContentTypeId == Guid(\"{customer_folder_ct_id}\")" # Фильтр по content_type_id

    customers_data = get_mp_children(token, parent_id, recursive=True, query=query_filter) # Используем get_mp_children с фильтром

    if customers_data is None:
        return jsonify({"error": "Не удалось получить список заказчиков из Vitro-CAD MP"}), 500

    return jsonify(customers_data) # Возвращаем данные в JSON

# Получает список объектов проектирования для конкретного заказчика
@bp.route('/objects/<customer_id>', methods=['GET'])
def get_objects_for_customer(customer_id):
    token = get_mp_token()
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500

    object_folder_ct_id = current_app.config['OBJECT_FOLDER_CT_ID'] # content_type_id для папок Объектов Проектирования

    query_filter = f"item => item.ContentTypeId == Guid(\"{object_folder_ct_id}\")" # Фильтр по content_type_id

    objects_data = get_mp_children(token, customer_id, recursive=True, query=query_filter) # Используем get_mp_children с фильтром и customer_id

    if objects_data is None:
        return jsonify({"error": "Не удалось получить список объектов проектирования из Vitro-CAD MP"}), 500

    return jsonify(objects_data)

# Получает список марок комплектов из Vitro-CAD MP
@bp.route('/marks', methods=['GET'])
def get_marks():
    token = get_mp_token()
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500

    marks_list_parent_id = current_app.config['MARKS_LIST_PARENT_ID'] # parentId для списка "Марки комплектов"

    marks_data = get_mp_children(token, marks_list_parent_id, recursive=False) # Используем get_mp_children для получения списка

    if marks_data is None:
        return jsonify({"error": "Не удалось получить список марок комплектов из Vitro-CAD MP"}), 500

    return jsonify(marks_data)