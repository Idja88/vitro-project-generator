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

    return project_updated_data

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

def delete_folder(token, delete_data):
    """Подготавливает данные для их удаления"""
    delete_income_data = []
    for child in delete_data:
        child_delete_income_data = {
            "id": child
        }
        delete_income_data.append(child_delete_income_data)
    
    # Удаляем папки
    deleted_data = vc.delete_mp_item(token, delete_income_data)

    if not  deleted_data:
        return jsonify({"error": "Не удалось удалить папки проекта"}), 500
        
    return deleted_data

# Создаем структуру проекта
@bp.route('/create/<project_id>', methods=['POST'])
@require_token
def create_project_structure(token, project_id):
    # Получаем JSON из тела запроса
    request_data = request.get_json()
    selection_matrix = request_data

    try:
        # Подготавливаем данные шаблонов
        project_template_income_data = prepare_template_data(token, current_app.config['PROJECT_TEMPLATE_FOLDER_ID'])
        mark_template_income_data = prepare_template_data(token, current_app.config['MARK_TEMPLATE_FOLDER_ID'])

        # Проверка, создана ли уже папка проекта
        if selection_matrix['folder_structure_id'] == '':
            # Создаем папку проекта
            project_folder_data = create_project_folder(token, parent_id=None, project_data=selection_matrix)

            # Сохраняем ID папки проекта в selection_matrix
            selection_matrix['folder_structure_id'] = project_folder_data[0]['id']

            # Копируем шаблоны проекта
            vc.copy_mp_item(token, project_folder_data[0]['id'], project_template_income_data)

        # Находим якорь в структуре проекта, если он есть
        project_anchor_data = vc.get_mp_children(
            token,
            selection_matrix['folder_structure_id'],
            recursive=True,
            query=f"item => item.GetValueAsString(\"name\") == \"{current_app.config['PROJECT_TEMPLATE_ANCHOR_NAME']}\""
        )

        # Если якоря нет, используем папку проекта как родительскую
        object_parent_id = project_anchor_data[0]['id'] if project_anchor_data else selection_matrix['folder_structure_id']

        #Собираем список на удаление
        delete_data = []

        # Проходим по объектам в матрице выбора
        for object_index, object_folder in enumerate(selection_matrix['objects']):
            if object_folder['id'] == '00000000-0000-0000-0000-000000000000':
                # Для специального объекта создаем марки напрямую
                for mark_index, mark_data in enumerate(object_folder['marks']):
                    # Если папка марки уже существует, пропускаем создание
                    if mark_data['folder_structure_id'] == '':
                        mark_folder_data = create_mark_folder(token, object_parent_id, mark_data)
                        #копируем шаблон марки в папку марки
                        vc.copy_mp_item(token, mark_folder_data[0]['id'], mark_template_income_data)
                        # Сохраняем ID папки марки в матрице выбора
                        selection_matrix['objects'][object_index]['marks'][mark_index]['folder_structure_id'] = mark_folder_data[0]['id']
                    # Если папка марки помечана на на удаление, добавляем в список на удаление
                    if mark_data['to_remove'] == True:
                        delete_data.append(mark_data['folder_structure_id'])
                        # Помечаем папку марки как удаленную
                        selection_matrix['objects'][object_index]['marks'][mark_index]['deleted'] = True
            else:
                # Если папка объекта уже существует, пропускаем создание
                if object_folder['folder_structure_id'] == '':
                    # Для обычного объекта создаем папку объекта
                    object_folder_data = create_object_folder(token, object_parent_id, object_folder)
                    selection_matrix['objects'][object_index]['folder_structure_id'] = object_folder_data[0]['id']
                # Если папка объекта помечена на удаление, добавляем в список на удаление
                if object_folder['to_remove'] == True:
                    delete_data.append(object_folder['folder_structure_id'])
                    # Помечаем папку объекта как удаленную
                    selection_matrix['objects'][object_index]['deleted'] = True
                # И марки внутри него
                for mark_index, mark_data in enumerate(object_folder['marks']):
                    # Если папка марки уже существует, пропускаем создание
                    if mark_data['folder_structure_id'] == '':
                        mark_folder_data = create_mark_folder(token, object_folder['folder_structure_id'], mark_data)
                        #копируем шаблон марки в папку марки
                        vc.copy_mp_item(token, mark_folder_data[0]['id'], mark_template_income_data)
                        # Сохраняем ID папки марки в матрице выбора
                        selection_matrix['objects'][object_index]['marks'][mark_index]['folder_structure_id'] = mark_folder_data[0]['id']
                    # Если папка марки помечана на удаление, добавляем в список на удаление
                    if mark_data['to_remove'] == True:
                        delete_data.append(mark_data['folder_structure_id'])
                        # Помечаем папку марки как удаленную
                        selection_matrix['objects'][object_index]['marks'][mark_index]['deleted'] = True
        
        #Если список не пустой, то запускаем процесс удаления
        if delete_data:
            # Удаляем папки, в обратном порядке, чтобы не нарушить структуру
            deleted_data = delete_folder(token, delete_data[::-1])
        
        # Обновляем информацию о проекте в реестре
        updated_project_info = update_project_info(token, parent_id=None, project_data=selection_matrix)
        
        return jsonify(selection_matrix), 201 # Возвращаем обновленную информацию о проекте

    except Exception as e:
        return jsonify({"error": "Не удалось создать структуру проекта"}), 500

# Обновляем структуру проекта
@bp.route('/update/<project_id>', methods=['POST'])
@require_token
def update_project_structure(token, project_id):
    # Получаем JSON из тела запроса
    request_data = request.get_json()
    new_selection_matrix = request_data

    return jsonify(new_selection_matrix), 201 # Возвращаем ID нового проекта