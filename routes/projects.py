from flask import Blueprint, jsonify, request, current_app
from vitro_cad_api import get_mp_token, update_mp_list # Импортируй функцию для обновления списка в Vitro-CAD MP

bp = Blueprint('projects', __name__, url_prefix='/projects')

# Создает новый проект (пока только в SQLite)
@bp.route('/create', methods=['POST'])
def create_new_project():
    project_data = request.get_json() # Получаем JSON из тела запроса

    if not project_data or not project_data.get('projectName') or not project_data.get('selectionMatrix'):
        return jsonify({"error": "Некорректные данные проекта"}), 400

    token = get_mp_token()
    if not token:
        return jsonify({"error": "Не удалось получить токен Vitro-CAD MP"}), 500
    
    vitro_cad_data = [{
        "list_id" : current_app.config['PROJECT_LIST_ID'],
        "content_type_id" : current_app.config['PROJECT_CT_ID'],
        "name": project_data['projectName'],
        "selection_matrix": project_data['selectionMatrix'],
        "is_created_by_generator": True
    }]

    project_id = update_mp_list(token, vitro_cad_data)

    if not project_id:
        return jsonify({"error": "Не удалось создать проект в базе данных"}), 500

    return jsonify({"message": "Проект успешно создан", "projectId": project_id[0]['id']}), 201 # Возвращаем ID нового проекта