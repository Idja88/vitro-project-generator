from flask import Blueprint, jsonify, request, current_app
import json
import vitro_cad_api as vc
from decorators import require_token

bp = Blueprint('set', __name__, url_prefix='/set')

# Обновляем инфомацию о проекте матрицей выбора
def update_project_info(token, parent_id, project_data):
    """Обновляет информацию о проекте в реестре"""
    project_id = project_data['id']
    project_name = project_data['name']

    project_income_data = [{
        "list_id" : current_app.config['PROJECT_LIST_ID'],
        "content_type_id" : current_app.config['PROJECT_CT_ID'],
        "id": project_id,
        "name": project_name,
        "selection_matrix": project_data,
        "is_created_by_generator": True
    }]

    project_updated_data = vc.update_mp_list(token, project_income_data)

    if not project_updated_data:
        return jsonify({"error": "Не удалось изменить проект"}), 500

    return jsonify(project_updated_data), 201 # Возвращаем ID нового проекта

# Создание папки проекта
def create_project_folder(token, parent_id, project_data):
    """Создает папку проекта"""
    project_id = project_data['id']
    project_name = project_data['name']
    if parent_id is None:
        parent_id = current_app.config['DOCUMENT_LIST_ID']

    project_folder_income_data = [{
        "list_id" : current_app.config['DOCUMENT_LIST_ID'],
        "parent_id": parent_id,
        "content_type_id" : current_app.config['PROJECT_FOLDER_CT_ID'],
        "name": project_name,
        "project_list_lookup": project_id
    }]

    project_folder_data = vc.update_mp_list(token, project_folder_income_data)

    if not project_folder_data:
        return jsonify({"error": "Не удалось создать папку проекта"}), 500

    return project_folder_data

# Создание папки объекта
def create_object_folder(token, parent_id, object_data):
    """Создает папку объекта"""
    object_name = object_data['name']
    object_id = object_data['id']

    object_folder_income_data = [{
        "list_id": current_app.config['DOCUMENT_LIST_ID'],
        "parent_id": parent_id,
        "content_type_id": current_app.config['OBJECT_FOLDER_CT_ID'],
        "name": object_name,
        "object_list_lookup": object_id
    }]
    
    object_folder_data = vc.update_mp_list(token, object_folder_income_data)

    if not object_folder_data:
        return jsonify({"error": "Не удалось создать папку объекта"}), 500
    
    return object_folder_data

# Создание папки марки
def create_mark_folder(token, parent_id, mark_data):
    """Создает папку марки"""
    mark_name = mark_data['name']
    mark_id = mark_data['id']
    mark_number = None if mark_data['number'] == '' else mark_data['number']
    
    mark_folder_income_data = [{
        "list_id": current_app.config['DOCUMENT_LIST_ID'],
        "parent_id": parent_id,
        "content_type_id": current_app.config['MARK_FOLDER_CT_ID'],
        "name": mark_name,
        "sheet_set_lookup": mark_id,
        "sheet_set_number": mark_number
    }]

    mark_folder_data = vc.update_mp_list(token, mark_folder_income_data)
    
    if not mark_folder_data:
        return jsonify({"error": "Не удалось создать марку проекта"}), 500
    
    return mark_folder_data

# Подготовка данных шаблонов для копирования
def prepare_template_data(token, template_folder_id):
    """Получает данные о дочерних элементах шаблона и подготавливает их для копирования"""
    template_children = vc.get_mp_children(token, template_folder_id, recursive=False)
    
    template_income_data = []
    if template_children:
        for child in template_children:
            child_template_income_data = {
                "id": child['id'],
                "isChildListCopyRequired": True
            }
            template_income_data.append(child_template_income_data)
    
    return template_income_data

# Создаем структуру проекта
@bp.route('/create/<project_id>', methods=['POST'])
@require_token
def create_new_project(token, project_id):
    # Получаем JSON из тела запроса
    project_data = request.get_json()

    # Преобразуем строку в JSON, если это необходимо
    if isinstance(project_data, str):
       selection_matrix = json.loads(project_data)
    else:
       selection_matrix = project_data

    try:
        # Подготавливаем данные шаблонов
        project_template_income_data = prepare_template_data(token, current_app.config['PROJECT_TEMPLATE_FOLDER_ID'])
        mark_template_income_data = prepare_template_data(token, current_app.config['MARK_TEMPLATE_FOLDER_ID'])

        # Создаем папку проекта
        project_folder_data = create_project_folder(token, parent_id=None, project_data=project_data)

        # Сохраняем ID папки проекта в selection_matrix
        selection_matrix['folder_structure_id'] = project_folder_data[0]['id']

        # Копируем шаблоны проекта
        project_template_data = vc.copy_mp_item(token, project_folder_data[0]['id'], project_template_income_data)

        # Находим якорь в структуре проекта, если он есть
        project_anchor_data = vc.get_mp_children(
            token, 
            project_folder_data[0]['id'], 
            recursive=True, 
            query=f"item => item.GetValueAsString(\"name\") == \"{current_app.config['PROJECT_TEMPLATE_ANCHOR_NAME']}\""
        )

        # Если якоря нет, используем папку проекта как родительскую
        object_parent_id = project_anchor_data[0]['id'] if project_anchor_data else project_folder_data[0]['id']

        # Проходим по объектам в матрице выбора
        for object_index, object_folder in enumerate(selection_matrix['objects']):
            if object_folder['id'] == '00000000-0000-0000-0000-000000000000':
                # Для специального объекта создаем марки напрямую
                for mark_index, mark_data in enumerate(object_folder['marks']):
                    mark_folder_data = create_mark_folder(token, object_parent_id, mark_data)
                    #копируем шаблон марки в папку марки
                    mark_template_data = vc.copy_mp_item(token, mark_folder_data[0]['id'], mark_template_income_data)
                    # Сохраняем ID папки марки в матрице выбора
                    selection_matrix['objects'][object_index]['marks'][mark_index]['folder_structure_id'] = mark_folder_data[0]['id']
            else:
                # Для обычного объекта создаем папку объекта
                object_folder_data = create_object_folder(token, object_parent_id, object_folder)
                selection_matrix['objects'][object_index]['folder_structure_id'] = object_folder_data[0]['id']
                # И марки внутри него
                for mark_index, mark_data in enumerate(object_folder['marks']):
                    mark_folder_data = create_mark_folder(token, object_folder_data[0]['id'], mark_data)
                    #копируем шаблон марки в папку марки
                    mark_template_data = vc.copy_mp_item(token, mark_folder_data[0]['id'], mark_template_income_data)
                    # Сохраняем ID папки марки в матрице выбора
                    selection_matrix['objects'][object_index]['marks'][mark_index]['folder_structure_id'] = mark_folder_data[0]['id']
        
        return jsonify(project_folder_data), 201 # Возвращаем ID нового проекта
    
    except Exception as e:
        return jsonify({"error": "Не удалось создать структуру проекта"}), 500
    
    finally:
        # Обновляем информацию о проекте в реестре
        update_project_info(token, parent_id=None, project_data=selection_matrix)