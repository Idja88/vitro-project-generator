from flask import Blueprint, jsonify, request, current_app
from database import create_project, get_project_list, get_project # Импортируй функции для работы с БД
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
        "name": project_data['projectName']
    }]

    vitro_cad_project = update_mp_list(token, vitro_cad_data)

    project_name = project_data['projectName']
    selection_matrix = project_data['selectionMatrix']
    vitro_cad_id = vitro_cad_project[0]['id']

    project_id = create_project(project_name, selection_matrix, vitro_cad_id) # Сохраняем проект в SQLite

    if not project_id:
        return jsonify({"error": "Не удалось создать проект в базе данных"}), 500

    return jsonify({"message": "Проект успешно создан", "projectId": project_id}), 201 # Возвращаем ID нового проекта

# Получает список проектов из SQLite
@bp.route('/list', methods=['GET'])
def get_projects_list():
    projects = get_project_list() # Получаем список проектов из БД
    return jsonify({"projects": projects})

# Получает данные проекта по ID из SQLite
@bp.route('/<project_id>', methods=['GET'])
def get_project_details(project_id):
    project = get_project(project_id) # Получаем проект по ID из БД
    if not project:
        return jsonify({"error": "Проект не найден"}), 404
    return jsonify({"project": project})