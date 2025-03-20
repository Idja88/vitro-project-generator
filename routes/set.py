import json
from flask import Blueprint, jsonify, request, current_app
import vitro_cad_api as vc
from decorators import require_token

bp = Blueprint('set', __name__, url_prefix='/set')

# Создает новый проект
@bp.route('/create', methods=['POST'])
@require_token
def create_new_project(token):
    project_data = request.get_json() # Получаем JSON из тела запроса

    if not project_data or not project_data.get('projectName') or not project_data.get('selectionMatrix'):
        return jsonify({"error": "Некорректные данные проекта"}), 400
   
    project_list_income_data = [{
        "list_id" : current_app.config['PROJECT_LIST_ID'],
        "content_type_id" : current_app.config['PROJECT_CT_ID'],
        "name": project_data['projectName'],
        "selection_matrix": project_data['selectionMatrix'],
        "is_created_by_generator": True
    }]

    project_list_data = vc.update_mp_list(token, project_list_income_data)

    if not project_list_data:
        return jsonify({"error": "Не удалось создать проект"}), 500
    
    selection_matrix = project_list_data[0]['fieldValueMap']['selection_matrix']
    
    project_folder_income_data = [{
        "list_id" : current_app.config['DOCUMENT_LIST_ID'],
        "parent_id": current_app.config['DOCUMENT_LIST_ID'],
        "content_type_id" : current_app.config['PROJECT_FOLDER_CT_ID'],
        "name": project_list_data[0]['fieldValueMap']['name'],
        "project_list_lookup": project_list_data[0]['id']
    }]

    project_folder_data = vc.update_mp_list(token, project_folder_income_data)

    if not project_folder_data:
        return jsonify({"error": "Не удалось создать папку проекта"}), 500

    if isinstance(selection_matrix, str):
        selection_matrix = jsonify(selection_matrix)

    for object_folder in selection_matrix['objects']:

        if object_folder['id'] == '00000000-0000-0000-0000-000000000000':
            object_folder_income_data = [{ 
                "list_id" : current_app.config['DOCUMENT_LIST_ID'],
                "parent_id": project_folder_data[0]['id'],
                "content_type_id" : current_app.config['OBJECT_FOLDER_CT_ID'],
                "name": object_folder['name']
            }]
        else:
            object_folder_income_data = [{
            "list_id" : current_app.config['DOCUMENT_LIST_ID'],
            "parent_id": project_folder_data[0]['id'],
            "content_type_id" : current_app.config['OBJECT_FOLDER_CT_ID'],
            "name": object_folder['name'],
            "object_list_lookup": object_folder['id']
        }]
        
        object_data = vc.update_mp_list(token, object_folder_income_data)

        if not object_data:
            return jsonify({"error": "Не удалось создать объект проекта"}), 500

        for mark_folder in object_folder['marks']:

            if mark_folder['number'] == '':
                mark_folder['number'] = None

            mark_folder_income_data = [{
                "list_id" : current_app.config['DOCUMENT_LIST_ID'],
                "parent_id": object_data[0]['id'],
                "content_type_id" : current_app.config['MARK_FOLDER_CT_ID'],
                "name": mark_folder['name'],
                "sheet_set_lookup": mark_folder['id'],
                "sheet_set_number": mark_folder['number']
            }]

            mark_data = vc.update_mp_list(token, mark_folder_income_data)

            if not mark_data:
                return jsonify({"error": "Не удалось создать марку проекта"}), 500

    return jsonify({"message": "Проект успешно создан", "projectId": project_list_data[0]['id']}), 201 # Возвращаем ID нового проекта

# Обновляем уже созданный проект
@bp.route('/update', methods=['POST'])
@require_token
def update_existing_project(token):
    project_data = request.get_json() # Получаем JSON из тела запроса

    if not project_data or not project_data.get('projectName') or not project_data.get('selectionMatrix'):
        return jsonify({"error": "Некорректные данные проекта"}), 400
    
    vitro_cad_data = [{
        "list_id" : current_app.config['PROJECT_LIST_ID'],
        "content_type_id" : current_app.config['PROJECT_CT_ID'],
        "id": project_data['projectId'],
        "name": project_data['projectName'],
        "selection_matrix": project_data['selectionMatrix'],
        "is_created_by_generator": True
    }]

    project_id = vc.update_mp_list(token, vitro_cad_data)

    if not project_id:
        return jsonify({"error": "Не удалось изменить проект"}), 500

    return jsonify({"message": "Проект успешно изменен", "projectId": project_id[0]['id']}), 201 # Возвращаем ID нового проекта