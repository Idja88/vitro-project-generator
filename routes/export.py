from flask import Blueprint, jsonify, send_file, current_app
import vitro_cad_api as vc
from decorators import require_token
from openpyxl import Workbook, load_workbook
from openpyxl.utils import get_column_letter
from io import BytesIO
import json
from datetime import datetime
import os

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

        # Создаем Excel файл
        #excel_buffer = create_simple_excel(project)

        # Если нужно использовать шаблон, раскомментируйте следующую строку
        excel_buffer = create_excel_from_template(token, project)    

        # Имя файла
        filename = f"{project['fieldValueMap']['name']}_Ф10.xlsx"
        
        return send_file(
            excel_buffer,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

#Создаем файл Excel с простой структурой
def create_simple_excel(project):

    selection_matrix_raw = project["fieldValueMap"]["selection_matrix"]

    # Парсим JSON
    if isinstance(selection_matrix_raw, str):
        selection_matrix = json.loads(selection_matrix_raw)
    else:
        selection_matrix = selection_matrix_raw

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

def create_excel_from_template(token, project):
    """Создает Excel файл на основе шаблона"""
    
    # Путь к шаблону
    template_path = os.path.join(os.path.dirname(__file__), '..', 'templates', 'f10_template.xlsx')
    
    try:
        # Загружаем шаблон
        wb = load_workbook(template_path)
        ws = wb.active
        print(f"Шаблон загружен успешно: {template_path}")
    except FileNotFoundError:
        print(f"Шаблон не найден: {template_path}")
        # Fallback - создаем новый файл
        wb = Workbook()
        ws = wb.active
        ws.title = "Ф10"
    
    # Получаем данные проекта
    project_name = project["fieldValueMap"]["name"]
    project_code = project["fieldValueMap"]["project_code_auto"]
    project_chief = project["fieldValueMap"]["chief_project_engineer"]["fieldValueMap"]["name"]
    selection_matrix_raw = project["fieldValueMap"]["selection_matrix"]

    # Парсим JSON
    if isinstance(selection_matrix_raw, str):
        selection_matrix = json.loads(selection_matrix_raw)
    else:
        selection_matrix = selection_matrix_raw
    
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
                    'display_name': display_name,
                    'full_name': None  # Будет заполнено из API
                }
    
    # === ПОЛУЧЕНИЕ ПОЛНЫХ НАЗВАНИЙ МАРОК ЧЕРЕЗ API ===
    if token:
        print("Получение полных названий марок через API...")
        for mark_key, mark_info in all_marks.items():
            try:
                # Получаем полную информацию о марке через API
                mark_data = vc.get_mp_item(token, mark_info['id'])
                if mark_data and 'fieldValueMap' in mark_data:
                    # Предполагаем, что название марки хранится в поле 'name' или 'title'
                    full_name = mark_data['fieldValueMap']['name']
                    if full_name:
                        all_marks[mark_key]['full_name'] = full_name
                        print(f"  Марка ID {mark_info['id']}: '{full_name}'")
                    else:
                        print(f"  Марка ID {mark_info['id']}: название не найдено в API")
                        all_marks[mark_key]['full_name'] = mark_info['display_name']  # Fallback
                else:
                    print(f"  Марка ID {mark_info['id']}: данные не получены из API")
                    all_marks[mark_key]['full_name'] = mark_info['display_name']  # Fallback
            except Exception as e:
                print(f"  Ошибка при получении марки ID {mark_info['id']}: {e}")
                all_marks[mark_key]['full_name'] = mark_info['display_name']  # Fallback
    else:
        # Если нет токена, используем display_name как fallback
        print("Токен недоступен, используем краткие названия марок")
        for mark_key in all_marks:
            all_marks[mark_key]['full_name'] = all_marks[mark_key]['display_name']
    
    mark_keys = list(all_marks.keys())
    
    # === ЗАПОЛНЕНИЕ МЕТАДАННЫХ ===
    print("Заполнение метаданных проекта...")
    
    # B1 - Название проекта
    ws['B1'] = project_name
    print(f"  Название проекта '{project_name}' размещено в B1")
    
    # F2 - Код проекта
    ws['F2'] = project_code
    print(f"  Код проекта '{project_code}' размещен в F2")
    
    # N3 - ГИП (главный инженер проекта)
    ws['N3'] = project_chief
    print(f"  ГИП '{project_chief}' размещен в N3")
    
    # S3 - Текущая дата в формате DD.MM.YYYY
    current_date = datetime.now().strftime("%d.%m.%Y")
    ws['S3'] = current_date
    print(f"  Дата '{current_date}' размещена в S3")
    
    # === РАЗМЕЩЕНИЕ ПОЛНЫХ НАЗВАНИЙ МАРОК ===
    # F8, G8, H8... - полные названия марок
    print(f"Размещение полных названий марок начиная с F8...")
    for i, mark_key in enumerate(mark_keys):
        col = 6 + i  # F=6, G=7, H=8, I=9...
        mark_info = all_marks[mark_key]
        
        cell = ws.cell(row=8, column=col)
        cell.value = mark_info['full_name']
        print(f"  Полное название '{mark_info['full_name']}' размещено в {get_column_letter(col)}8")
    
    # === РАЗМЕЩЕНИЕ НУМЕРАЦИИ МАРОК ===
    # F10, G10, H10... - целые числа начиная с 3
    print(f"Размещение нумерации марок начиная с F10...")
    for i in range(len(mark_keys)):
        col = 6 + i  # F=6, G=7, H=8, I=9...
        number = 3 + i  # Начинаем с 3
        
        cell = ws.cell(row=10, column=col)
        cell.value = number
        print(f"  Номер '{number}' размещен в {get_column_letter(col)}10")
    
    # === РАЗМЕЩЕНИЕ МАРОК ===
    # Марки размещаются горизонтально начиная с F9, G9, H9...
    print(f"Размещение {len(mark_keys)} марок начиная с F9...")
    for i, mark_key in enumerate(mark_keys):
        col = 6 + i  # F=6, G=7, H=8, I=9...
        mark_info = all_marks[mark_key]
        
        # Записываем в ячейку (для объединенных ячеек openpyxl автоматически записывает в первую)
        cell = ws.cell(row=9, column=col)
        cell.value = mark_info['display_name']
        print(f"  Марка '{mark_info['display_name']}' размещена в {get_column_letter(col)}9")
    
    # === РАЗМЕЩЕНИЕ ОБЪЕКТОВ ===
    # Объекты размещаются вертикально начиная с C11, C12, C13...
    # Коды объектов размещаются в B11, B12, B13...
    print(f"Размещение {len(objects)} объектов начиная с C11...")
    for i, obj in enumerate(objects):
        row = 11 + i  # C11, C12, C13...
        
        # === ФОРМИРОВАНИЕ И РАЗМЕЩЕНИЕ КОДА ОБЪЕКТА ===
        # Код объекта = project_code + "-" + object['number'] (если есть number)
        if obj.get('number'):
            object_code = f"{project_code}-{obj['number']}"
        else:
            object_code = project_code
        
        # Записываем код объекта в столбец B
        code_cell = ws.cell(row=row, column=2)  # B=2
        code_cell.value = object_code
        print(f"  Код объекта '{object_code}' размещен в B{row}")
        
        # Записываем имя объекта в столбец C
        name_cell = ws.cell(row=row, column=3)  # C=3
        name_cell.value = obj['name']
        print(f"  Объект '{obj['name']}' размещен в C{row}")
        
        # === РАЗМЕЩЕНИЕ ПЕРЕСЕЧЕНИЙ ===
        # Для каждого объекта проверяем наличие марок и ставим "X"
        for j, mark_key in enumerate(mark_keys):
            col = 6 + j  # F=6, G=7, H=8...
            mark_info = all_marks[mark_key]
            
            # Проверяем наличие марки у объекта
            has_mark = any(
                mark['id'] == mark_info['id'] and 
                mark.get('number', '') == mark_info['number'] and 
                not mark.get('deleted', False)
                for mark in obj['marks']
            )
            
            if has_mark:
                intersection_cell = ws.cell(row=row, column=col)
                intersection_cell.value = 'X'
                print(f"    Пересечение 'X' в {get_column_letter(col)}{row}")
    
    print("Формирование Excel файла завершено")
    
    # Сохранение
    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)
    
    return excel_buffer