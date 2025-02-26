from flask import Blueprint, jsonify, request # Импортируй request
from database import create_project, get_project_list, get_project # Импортируй функции для работы с БД

bp = Blueprint('projects', __name__, url_prefix='/projects')

# Создает новый проект (пока только в SQLite)
@bp.route('/create', methods=['POST'])
def create_new_project():
    project_data = request.get_json() # Получаем JSON из тела запроса

    if not project_data or not project_data.get('projectName') or not project_data.get('selectionMatrix'):
        return jsonify({"error": "Некорректные данные проекта"}), 400

    project_name = project_data['projectName']
    selection_matrix = project_data['selectionMatrix'] # Предполагаем, что frontend отправляет матрицу в JSON

    project_id = create_project(project_name, selection_matrix) # Сохраняем проект в SQLite

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