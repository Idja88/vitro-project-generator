import json
from flask import Blueprint, jsonify, request, current_app
import vitro_cad_api as vc
from decorators import require_token

bp = Blueprint('set', __name__, url_prefix='/set')

# Создает новый проект
@bp.route('/create/<project_id>', methods=['POST'])
@require_token
def create_new_project(token, project_id):
    project_data = request.get_json() # Получаем JSON из тела запроса

    if not project_data or not project_data.get('projectName') or not project_data.get('selectionMatrix'):
        return jsonify({"error": "Некорректные данные проекта"}), 400

    project_folder_income_data = [{
        "list_id" : current_app.config['DOCUMENT_LIST_ID'],
        "parent_id": current_app.config['DOCUMENT_LIST_ID'],
        "content_type_id" : current_app.config['PROJECT_FOLDER_CT_ID'],
        "name": project_data['projectName'],
        "project_list_lookup": project_id
    }]

    project_folder_data = vc.update_mp_list(token, project_folder_income_data)

    if not project_folder_data:
        return jsonify({"error": "Не удалось создать папку проекта"}), 500

    return jsonify({"message": "Проект успешно создан", "projectId": project_folder_data[0]['id']}), 201 # Возвращаем ID нового проекта

# Обновляем уже созданный проект
@bp.route('/update/<project_id>', methods=['POST'])
@require_token
def update_existing_project(token, project_id):
    project_data = request.get_json() # Получаем JSON из тела запроса

    if not project_data or not project_data.get('projectName') or not project_data.get('selectionMatrix'):
        return jsonify({"error": "Некорректные данные проекта"}), 400
    
    vitro_cad_data = [{
        "list_id" : current_app.config['PROJECT_LIST_ID'],
        "content_type_id" : current_app.config['PROJECT_CT_ID'],
        "id": project_id,
        "name": project_data['projectName'],
        "selection_matrix": project_data['selectionMatrix'],
        "is_created_by_generator": True
    }]

    project_id = vc.update_mp_list(token, vitro_cad_data)

    if not project_id:
        return jsonify({"error": "Не удалось изменить проект"}), 500

    return jsonify({"message": "Проект успешно изменен", "projectId": project_id[0]['id']}), 201 # Возвращаем ID нового проекта