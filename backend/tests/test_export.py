"""Tier 2: GET /export/excel/<project_id> — экспорт Формы 10."""
import json
from datetime import datetime
from io import BytesIO
from urllib.parse import unquote

import pytest
from openpyxl import load_workbook

from tests.fakes import mark, matrix, obj

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 11, 10, 12, 0, 0)


@pytest.fixture
def frozen_date(monkeypatch):
    monkeypatch.setattr("vitro_generator.legacy.export.datetime", FrozenDatetime)


def project_item(selection_matrix, name="Проект", code="PRJ", chief="Иванов И.И."):
    return {
        "id": "P1",
        "fieldValueMap": {
            "name": name,
            "code": code,
            "chief_project_engineer": {"fieldValueMap": {"name": chief}},
            "selection_matrix": selection_matrix,
        },
    }


def mark_item(full_name, package=None):
    field_values = {"name": full_name}
    if package:
        field_values["sheet_package_lookup"] = {"fieldValueMap": {"name": package}}
    return {"fieldValueMap": field_values}


# Корпус: АР, КЖ, КЖ2, ГП (+ удалённая ОВ); Склад без номера: АР; удалённый объект
SAMPLE_MATRIX = matrix([
    obj("O1", "Корпус", [
        mark("M1", "АР"),
        mark("M2", "КЖ"),
        mark("M2", "КЖ", number="2"),
        mark("M4", "ГП"),
        mark("M5", "ОВ", deleted=True),
    ], number="1"),
    obj("O2", "Склад", [mark("M1", "АР")], number=""),
    obj("O3", "Удалённый", [mark("M1", "АР")], number="3", deleted=True),
])

MARK_ITEMS = {
    "M1": mark_item("Архитектурные решения", "Архитектура"),
    "M2": mark_item("Конструкции железобетонные", "Конструкции"),
    "M4": mark_item("Генеральный план"),
}


def export(auth_client, vitro_factory, selection_matrix=SAMPLE_MATRIX, mark_items=MARK_ITEMS, project=None):
    items = {"P1": project if project is not None else project_item(selection_matrix), **mark_items}
    fake = vitro_factory(items=items)
    return auth_client.get("/export/excel/P1"), fake


def sheet(response):
    return load_workbook(BytesIO(response.data)).active


def row_values(ws, row, first_col, last_col):
    return [ws.cell(row=row, column=c).value for c in range(first_col, last_col + 1)]


# --- E1: ошибки ---

def test_e1_project_not_found(auth_client, vitro_factory):
    vitro_factory(items={})
    response = auth_client.get("/export/excel/P1")

    assert response.status_code == 404
    assert response.get_json() == {"error": "Проект не найден"}


def test_e1_missing_selection_matrix(auth_client, vitro_factory):
    response, _ = export(auth_client, vitro_factory, project=project_item(None))

    assert response.status_code == 400
    assert response.get_json() == {"error": "Матрица выбора отсутствует"}


def test_export_requires_token(client, vitro, prod_env):
    assert client.get("/export/excel/P1").status_code == 401


# --- E2: метаданные ---

def test_e2_metadata_cells(auth_client, vitro_factory, frozen_date):
    response, _ = export(auth_client, vitro_factory)
    ws = sheet(response)

    assert response.status_code == 200
    assert ws["B1"].value == "Проект"
    assert ws["F2"].value == "PRJ"
    assert ws["N3"].value == "Иванов И.И."
    assert ws["S3"].value == "10.11.2026"


# --- E3/E4/E7: колонки марок ---

def test_e3_packages_sorted_merged_and_unpackaged_last(auth_client, vitro_factory, frozen_date):
    response, _ = export(auth_client, vitro_factory)
    ws = sheet(response)

    # F = Архитектура (1 марка), G:H = Конструкции (2 марки), I = без раздела
    assert row_values(ws, 7, 6, 9) == ["Архитектура", "Конструкции", None, None]
    merged = {str(r) for r in ws.merged_cells.ranges}
    assert "G7:H7" in merged
    assert not any(r.startswith("F7") for r in merged)


def test_e4_mark_header_rows(auth_client, vitro_factory, frozen_date):
    response, _ = export(auth_client, vitro_factory)
    ws = sheet(response)

    assert row_values(ws, 8, 6, 9) == [
        "Архитектурные решения",
        "Конструкции железобетонные",
        "Конструкции железобетонные",
        "Генеральный план",
    ]
    assert row_values(ws, 9, 6, 9) == ["АР", "КЖ", "КЖ2", "ГП"]
    assert row_values(ws, 10, 6, 9) == [3, 4, 5, 6]
    assert ws.cell(row=9, column=10).value is None, "лишних колонок быть не должно"


def test_e7_same_mark_with_different_numbers_gets_separate_columns(auth_client, vitro_factory, frozen_date):
    response, _ = export(auth_client, vitro_factory)
    headers = row_values(sheet(response), 9, 6, 9)

    assert headers.count("КЖ") == 1 and headers.count("КЖ2") == 1


# --- E5/E6: строки объектов ---

def test_e5_object_rows_codes_and_intersections(auth_client, vitro_factory, frozen_date):
    response, _ = export(auth_client, vitro_factory)
    ws = sheet(response)

    assert ws["B11"].value == "PRJ-1"
    assert ws["C11"].value == "Корпус"
    assert row_values(ws, 11, 6, 9) == ["+", "+", "+", "+"]

    assert ws["B12"].value == "PRJ", "без номера код объекта = код проекта"
    assert ws["C12"].value == "Склад"
    assert row_values(ws, 12, 6, 9) == ["+", None, None, None]


def test_e6_deleted_objects_and_marks_are_excluded(auth_client, vitro_factory, frozen_date):
    response, fake = export(auth_client, vitro_factory)
    ws = sheet(response)

    object_names = [ws.cell(row=r, column=3).value for r in range(11, 15)]
    assert "Удалённый" not in object_names
    assert ws["C13"].value is None
    assert "ОВ" not in row_values(ws, 9, 6, 12)
    assert all(c[1] != "M5" for c in fake.calls_of("get_mp_item")), "удалённая марка не запрашивается"


# --- E8/E9: устойчивость к данным ---

def test_e8_mark_lookup_failure_falls_back_to_display_name(auth_client, vitro_factory, frozen_date):
    response, _ = export(auth_client, vitro_factory, mark_items={})
    ws = sheet(response)

    assert response.status_code == 200
    assert row_values(ws, 7, 6, 9) == [None, None, None, None]
    assert row_values(ws, 8, 6, 9) == ["АР", "КЖ", "КЖ2", "ГП"]
    assert row_values(ws, 9, 6, 9) == ["АР", "КЖ", "КЖ2", "ГП"]


def test_e9_matrix_as_json_string_gives_same_result(auth_client, vitro_factory, frozen_date):
    as_dict, _ = export(auth_client, vitro_factory, selection_matrix=SAMPLE_MATRIX)
    as_string, _ = export(auth_client, vitro_factory, selection_matrix=json.dumps(SAMPLE_MATRIX))
    ws_dict, ws_string = sheet(as_dict), sheet(as_string)

    for row in range(7, 13):
        assert row_values(ws_dict, row, 2, 9) == row_values(ws_string, row, 2, 9)


# --- E10: HTTP-ответ ---

def test_e10_download_headers(auth_client, vitro_factory, frozen_date):
    response, _ = export(auth_client, vitro_factory)

    assert response.mimetype == XLSX_MIME
    disposition = unquote(response.headers["Content-Disposition"])
    assert disposition.startswith("attachment")
    assert "Проект_Ф10.xlsx" in disposition


# --- E11: шаблона нет ---

def test_e11_without_template_builds_simple_sheet(auth_client, vitro_factory, monkeypatch):
    monkeypatch.setattr("vitro_generator.legacy.export.os.path.exists", lambda path: False)
    response, _ = export(auth_client, vitro_factory)
    ws = sheet(response)

    assert response.status_code == 200
    assert ws.title == "Ф10"
    assert row_values(ws, 1, 1, 5) == ["Объект", "АР", "КЖ", "КЖ2", "ГП"]
    assert row_values(ws, 2, 1, 5) == ["Корпус", "True", "True", "True", "True"]
    assert row_values(ws, 3, 1, 5) == ["Склад", "True", "False", "False", "False"]
    assert ws.cell(row=4, column=1).value is None
