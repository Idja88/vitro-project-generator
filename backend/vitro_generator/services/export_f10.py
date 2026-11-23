"""Построение аналога Формы 10 (Excel) по матрице выбора проекта.

Координаты ячеек шаблона resources/f10_template.xlsx: B1 название, F2 код, N3 ГИП, S3 дата,
строка 7 — разделы, 8 — полные названия марок, 9 — коды марок, 10 — нумерация с 3,
объекты с 11-й строки (B — код, C — название), пересечения с колонки F.
"""

import os
from datetime import datetime
from io import BytesIO

from flask import current_app
from openpyxl import Workbook, load_workbook
from openpyxl.utils import get_column_letter

from vitro_generator import vitro_cad_api as vc
from vitro_generator.services.matrix import (
    active_objects,
    display_name,
    object_has_mark,
    ordered_active_marks,
    parse_matrix,
)

FIRST_MARK_COL = 6  # F
FIRST_OBJECT_ROW = 11


def template_path():
    return os.path.join(current_app.root_path, "resources", "f10_template.xlsx")


def build_f10(token, project):
    """Возвращает (BytesIO с xlsx, имя файла). project — элемент проекта из Vitro-CAD."""
    path = template_path()
    if os.path.exists(path):
        buffer = create_excel_from_template(token, project, path)
    else:
        buffer = create_simple_excel(project)
    return buffer, f"{project['fieldValueMap']['name']}_Ф10.xlsx"


def _save(wb):
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def create_simple_excel(project):
    """Упрощённая таблица без шаблона: объекты × марки, True/False на пересечениях."""
    matrix = parse_matrix(project["fieldValueMap"]["selection_matrix"])
    objects = active_objects(matrix)
    marks = ordered_active_marks(matrix)

    wb = Workbook()
    ws = wb.active
    ws.title = "Ф10"

    for col, header in enumerate(["Объект"] + [display_name(m) for m in marks.values()], 1):
        ws.cell(row=1, column=col, value=header)

    for row, obj in enumerate(objects, 2):
        ws.cell(row=row, column=1, value=obj["name"])
        for col, key in enumerate(marks, 2):
            ws.cell(row=row, column=col, value="True" if object_has_mark(obj, key) else "False")

    return _save(wb)


def _mark_details(token, mark):
    """Полное название и раздел марки из реестра «Марки комплекта»; при ошибке — код марки и без раздела."""
    fallback = display_name(mark)
    try:
        data = vc.get_mp_item(token, mark["id"]) if token else None
    except Exception:
        data = None
    if not data or "fieldValueMap" not in data:
        return fallback, None

    full_name = data["fieldValueMap"].get("name") or fallback
    try:
        package = data["fieldValueMap"]["sheet_package_lookup"]["fieldValueMap"]["name"]
    except (KeyError, TypeError):
        package = None
    return full_name, package


def create_excel_from_template(token, project, path):
    wb = load_workbook(path)
    ws = wb.active

    fields = project["fieldValueMap"]
    project_code = fields["code"]
    matrix = parse_matrix(fields["selection_matrix"])
    objects = active_objects(matrix)

    # Марки в порядке колонок с данными из реестра
    marks = []
    for key, mark in ordered_active_marks(matrix).items():
        full_name, package = _mark_details(token, mark)
        marks.append({"key": key, "code": display_name(mark), "full_name": full_name, "package": package})

    # Группировка: разделы по алфавиту, внутри раздела — порядок колонок; марки без раздела в конце
    packages = sorted({m["package"] for m in marks if m["package"]})
    columns = [m for p in packages for m in marks if m["package"] == p] + [m for m in marks if not m["package"]]

    # Метаданные
    ws["B1"] = fields["name"]
    ws["F2"] = project_code
    ws["N3"] = fields["chief_project_engineer"]["fieldValueMap"]["name"]
    ws["S3"] = datetime.now().strftime("%d.%m.%Y")

    # Заголовки марок
    for i, mark in enumerate(columns):
        col = FIRST_MARK_COL + i
        ws.cell(row=8, column=col, value=mark["full_name"])
        ws.cell(row=9, column=col, value=mark["code"])
        ws.cell(row=10, column=col, value=3 + i)

    # Разделы в строке 7 с объединением ячеек
    for package in packages:
        cols = [FIRST_MARK_COL + i for i, m in enumerate(columns) if m["package"] == package]
        ws.cell(row=7, column=cols[0], value=package)
        if len(cols) > 1:
            ws.merge_cells(f"{get_column_letter(cols[0])}7:{get_column_letter(cols[-1])}7")

    # Объекты и пересечения
    for i, obj in enumerate(objects):
        row = FIRST_OBJECT_ROW + i
        ws.cell(row=row, column=2, value=f"{project_code}-{obj['number']}" if obj.get("number") else project_code)
        ws.cell(row=row, column=3, value=obj["name"])
        for j, mark in enumerate(columns):
            if object_has_mark(obj, mark["key"]):
                ws.cell(row=row, column=FIRST_MARK_COL + j, value="+")

    return _save(wb)
