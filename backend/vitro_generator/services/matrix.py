"""Общие операции над матрицей выбора (selection_matrix) без обращений к Vitro-CAD.

Формат матрицы:
    { id, name, folder_structure_id, mark_order?: [ { id, number }, ... ],
      objects: [ { id, name, number, folder_structure_id, deleted, to_remove, to_restore,
                   marks: [ { id, name, number, folder_structure_id, deleted, to_remove, to_restore } ] } ] }

`mark_order` необязателен: порядок колонок-марок слева направо, каждая колонка — пара id марки
и номер раздела. Марки, которых в нём нет, идут после перечисленных в порядке первого появления.
Элементы, не являющиеся колонкой {id, number}, при чтении не учитываются.
"""

import json
import re

# Идентификаторы Vitro-CAD подставляются в строки запросов (item => ... == "<id>"), поэтому допускаем
# только буквы, цифры и дефис: GUID проходит, кавычки и прочие символы запроса — нет.
_SAFE_ID = re.compile(r"^[0-9A-Za-z-]{1,64}$")
_MARK_NUMBER = re.compile(r"^([1-9]\d?)?$")  # пусто или 1–99


def parse_matrix(raw):
    """selection_matrix хранится в Vitro-CAD строкой JSON или объектом — приводим к dict."""
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


def project_code(fields):
    """Код проекта: Vitro-CAD вычисляет его в project_code_auto; code — прежнее имя поля."""
    return fields.get("project_code_auto") or fields.get("code") or ""


def lookup_name(fields, name):
    """Отображаемое имя элемента, на который ссылается поле-lookup (например, ГИП), или None."""
    value = fields.get(name)
    if isinstance(value, dict):
        return (value.get("fieldValueMap") or {}).get("name")
    return None


def mark_key(mark):
    """Марка идентифицируется парой id + номер раздела (АР1 и АР2 — разные колонки)."""
    return f"{mark['id']}|{mark.get('number') or ''}"


def display_name(mark):
    number = mark.get("number")
    return f"{mark['name']}{number}" if number else mark["name"]


def active_objects(matrix):
    return [obj for obj in matrix["objects"] if not obj.get("deleted", False)]


def ordered_active_marks(matrix):
    """Уникальные неудалённые марки активных объектов в порядке колонок: {mark_key: mark}."""
    found = {}
    for obj in active_objects(matrix):
        for mark in obj["marks"]:
            if not mark.get("deleted", False):
                found.setdefault(mark_key(mark), mark)

    keys = [mark_key(entry) for entry in matrix.get("mark_order") or [] if isinstance(entry, dict) and "id" in entry]
    ordered = {key: found[key] for key in keys if key in found}
    for key, mark in found.items():
        ordered.setdefault(key, mark)
    return ordered


def object_has_mark(obj, key):
    return any(mark_key(mark) == key and not mark.get("deleted", False) for mark in obj["marks"])


def validate_matrix(data):
    """Проверяет тело запроса с матрицей. Возвращает список ошибок (пустой — матрица корректна)."""
    if not isinstance(data, dict) or not isinstance(data.get("objects"), list):
        return ["Некорректный формат матрицы выбора"]

    errors = []

    def check_id(value, what, allow_empty=False):
        if allow_empty and value == "":
            return
        if not isinstance(value, str) or not _SAFE_ID.match(value):
            errors.append(f"Некорректный идентификатор {what}: {value!r}")

    check_id(data.get("id"), "проекта")
    check_id(data.get("folder_structure_id", ""), "папки проекта", allow_empty=True)

    for obj in data["objects"]:
        if not isinstance(obj, dict) or not isinstance(obj.get("marks"), list):
            errors.append("Некорректный формат объекта в матрице")
            continue
        check_id(obj.get("id"), f"объекта «{obj.get('name')}»")
        check_id(obj.get("folder_structure_id", ""), f"папки объекта «{obj.get('name')}»", allow_empty=True)
        for mark in obj["marks"]:
            if not isinstance(mark, dict):
                errors.append("Некорректный формат марки в матрице")
                continue
            check_id(mark.get("id"), f"марки «{mark.get('name')}»")
            check_id(mark.get("folder_structure_id", ""), f"папки марки «{mark.get('name')}»", allow_empty=True)
            if not _MARK_NUMBER.match(str(mark.get("number") or "")):
                errors.append(f"Некорректный номер раздела марки «{mark.get('name')}»: {mark.get('number')!r}")

    mark_order = data.get("mark_order")
    if mark_order is not None:
        if not isinstance(mark_order, list):
            errors.append("mark_order должен быть списком колонок {id, number}")
        else:
            for entry in mark_order:
                if not isinstance(entry, dict):
                    errors.append("mark_order должен быть списком колонок {id, number}")
                    break
                check_id(entry.get("id"), "марки в mark_order")
                if not _MARK_NUMBER.match(str(entry.get("number") or "")):
                    errors.append(f"Некорректный номер раздела в mark_order: {entry.get('number')!r}")

    return errors
