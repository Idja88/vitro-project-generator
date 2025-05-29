from flask import Blueprint, jsonify, send_file
import vitro_cad_api as vc
from decorators import require_token
from openpyxl import Workbook
from io import BytesIO
import json

bp = Blueprint('export', __name__, url_prefix='/export')

@bp.route('/excel/<project_id>', methods=['GET'])
@require_token
def export_project_to_excel(token, project_id):
    try:
        # Получаем данные проекта
        project = vc.get_mp_item(token, project_id)

        # Простые проверки
        if not project:
            return jsonify({'error': 'Проект не найден'}), 404
        
        if project["fieldValueMap"].get("selection_matrix") is None:
            return jsonify({'error': 'Матрица выбора отсутствует'}), 400

        project_name = project["fieldValueMap"]["name"]
        selection_matrix_raw = project["fieldValueMap"]["selection_matrix"]

        # Парсим JSON
        if isinstance(selection_matrix_raw, str):
            selection_matrix = json.loads(selection_matrix_raw)
        else:
            selection_matrix = selection_matrix_raw

        # Создаем Excel файл
        excel_buffer = create_simple_excel(selection_matrix)

        # Имя файла
        filename = f"{project_name}_Ф10.xlsx"
        
        return send_file(
            excel_buffer,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

#Создаем файл Excel с простой структурой
def create_simple_excel(selection_matrix):    
    wb = Workbook()
    ws = wb.active
    ws.title = "Ф10"
    
    # Получаем объекты (не удаленные)
    objects = [obj for obj in selection_matrix['objects'] if not obj.get('deleted', False)]
    
    # Получаем все уникальные марки (учитываем ID + номер)
    all_marks = {}
    for obj in objects:
        for mark in obj['marks']:
            if not mark.get('deleted', False):
                mark_id = mark['id']
                mark_number = mark['number']
                mark_name = mark['name']
                
                # Создаем уникальный ключ: mark_id + mark_number
                mark_key = f"{mark_id}_{mark_number}"
                
                # Формируем отображаемое имя марки
                if mark_number:
                    display_name = f"{mark_name}{mark_number}"
                else:
                    display_name = mark_name
                
                all_marks[mark_key] = {
                    'id': mark_id,
                    'number': mark_number,
                    'name': mark_name,
                    'display_name': display_name
                }
    
    # Заголовки
    headers = ['Объект'] + [mark_info['display_name'] for mark_info in all_marks.values()]
    mark_keys = list(all_marks.keys())
    
    # Записываем заголовки
    for col, header in enumerate(headers, 1):
        ws.cell(row=1, column=col, value=header)
    
    # Записываем данные
    for row_idx, obj in enumerate(objects, 2):
        # Имя объекта
        ws.cell(row=row_idx, column=1, value=obj['name'])
        
        # Проверяем каждую марку
        for col_idx, mark_key in enumerate(mark_keys, 2):
            mark_info = all_marks[mark_key]
            
            # Ищем точное совпадение по ID и номеру
            has_mark = any(
                mark['id'] == mark_info['id'] and 
                mark.get('number', '') == mark_info['number'] and 
                not mark.get('deleted', False)
                for mark in obj['marks']
            )
            
            ws.cell(row=row_idx, column=col_idx, value='True' if has_mark else 'False')
    
    # Сохранение
    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)
    
    return excel_buffer