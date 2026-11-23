"""JSON API /api/v1 для React: DTO, предпросмотр, создание структуры, Ф10, валидация."""

from io import BytesIO

import pytest
from openpyxl import load_workbook

from tests.fakes import NULL_OBJECT_ID, mark, matrix, obj
from vitro_generator.services.matrix import ordered_active_marks, validate_matrix
from vitro_generator.services.preview import plan_actions

API = "/api/v1"


# --- справочники и проект ---


def test_config_returns_registry_links(auth_client, vitro):
    data = auth_client.get(f"{API}/config").get_json()

    assert data == {
        "vitroBaseUrl": "http://vitro.test",
        "objectListUrl": "http://vitro.test/list/L-OBJ",
        "markListUrl": "http://vitro.test/list/L-MARK",
    }


def test_project_is_normalized(auth_client, vitro_factory):
    item = {
        "id": "P1",
        "fieldValueMap": {
            "name": "Проект",
            "code": "PRJ",
            "chief_project_engineer": {"fieldValueMap": {"name": "Иванов И.И."}},
            "object_list_lookup_tree": {"id": "SITE-1"},
            "is_created_by_generator": True,
            "selection_matrix": '{"id": "P1", "name": "Проект", "folder_structure_id": "PF", "objects": []}',
        },
    }
    vitro_factory(items={"P1": item})

    data = auth_client.get(f"{API}/projects/P1").get_json()

    assert data == {
        "id": "P1",
        "name": "Проект",
        "code": "PRJ",
        "chief": "Иванов И.И.",
        "objectParentId": "SITE-1",
        "isGenerated": True,
        "matrix": {"id": "P1", "name": "Проект", "folder_structure_id": "PF", "objects": []},
    }


def test_new_project_has_no_matrix(auth_client, vitro_factory):
    vitro_factory(items={"P1": {"id": "P1", "fieldValueMap": {"name": "Новый"}}})

    data = auth_client.get(f"{API}/projects/P1").get_json()

    assert data["matrix"] is None and data["isGenerated"] is False and data["chief"] is None


def test_missing_project_is_404(auth_client, vitro_factory):
    vitro_factory(items={})
    assert auth_client.get(f"{API}/projects/NOPE").status_code == 404


def test_objects_are_normalized(auth_client, vitro, monkeypatch):
    from vitro_generator import vitro_cad_api

    calls = []

    def children(token, parent_id, recursive=False, query=None):
        calls.append((parent_id, recursive, query))
        return [
            {"id": "O1", "fieldValueMap": {"name": "Корпус", "object_plan_number": 3}},
            {"id": "O2", "fieldValueMap": {"name": "Склад"}},
        ]

    monkeypatch.setattr(vitro_cad_api, "get_mp_children", children)

    data = auth_client.get(f"{API}/objects?parent=SITE-1").get_json()

    assert data == [{"id": "O1", "name": "Корпус", "number": "3"}, {"id": "O2", "name": "Склад", "number": ""}]
    assert calls == [("SITE-1", True, 'item => item.ContentTypeId == Guid("CT-OBJ")')]


def test_objects_require_parent(auth_client, vitro):
    assert auth_client.get(f"{API}/objects").status_code == 400


def test_marks_are_normalized(auth_client, vitro, monkeypatch):
    from vitro_generator import vitro_cad_api

    monkeypatch.setattr(
        vitro_cad_api,
        "get_mp_children",
        lambda *a, **k: [{"id": "M1", "fieldValueMap": {"code": "АР", "name": "Архитектурные решения"}}],
    )

    assert auth_client.get(f"{API}/marks").get_json() == [{"id": "M1", "code": "АР", "name": "Архитектурные решения"}]


@pytest.mark.parametrize("path", ["/marks", "/objects?parent=X"])
def test_vitro_failure_is_502(auth_client, vitro, monkeypatch, path):
    from vitro_generator import vitro_cad_api

    monkeypatch.setattr(vitro_cad_api, "get_mp_children", lambda *a, **k: None)
    response = auth_client.get(f"{API}{path}")

    assert response.status_code == 502
    assert "Vitro-CAD" in response.get_json()["error"]


@pytest.mark.parametrize("path", ["/config", "/projects/P1", "/marks", "/objects?parent=X"])
def test_routes_require_token(client, vitro, prod_env, path):
    assert client.get(f"{API}{path}").status_code == 401


# --- создание структуры и Ф10 через /api/v1 ---


def test_create_structure(auth_client, vitro):
    selection = matrix([obj("O1", "Объект", [mark("M1", "АР")])])
    response = auth_client.post(f"{API}/projects/P1/structure", json=selection)

    assert response.status_code == 201
    assert response.get_json()["matrix"]["objects"][0]["marks"][0]["folder_structure_id"] != ""
    assert vitro.updates("CT-MF")


def test_create_structure_preserves_mark_order(auth_client, vitro):
    selection = matrix([obj("O1", "Объект", [mark("M1", "АР")])])
    selection["mark_order"] = ["M1|"]

    response = auth_client.post(f"{API}/projects/P1/structure", json=selection)

    assert response.get_json()["matrix"]["mark_order"] == ["M1|"]
    assert vitro.updates("CT-PROJ")[0]["selection_matrix"]["mark_order"] == ["M1|"]


def test_create_structure_rejects_unsafe_ids(auth_client, vitro):
    selection = matrix([obj('O1"', "Объект", [])])
    response = auth_client.post(f"{API}/projects/P1/structure", json=selection)

    assert response.status_code == 400
    assert "Некорректный идентификатор объекта" in response.get_json()["error"]
    assert vitro.calls == []


def test_f10_respects_mark_order(auth_client, vitro_factory):
    selection = matrix([obj("O1", "Корпус", [mark("M1", "АР"), mark("M2", "КЖ"), mark("M3", "ГП")])])
    selection["mark_order"] = ["M3|", "M1|"]  # M2 не указан — идёт после перечисленных
    project = {
        "id": "P1",
        "fieldValueMap": {
            "name": "Проект",
            "code": "PRJ",
            "chief_project_engineer": {"fieldValueMap": {"name": "ГИП"}},
            "selection_matrix": selection,
        },
    }
    vitro_factory(items={"P1": project})

    response = auth_client.get(f"{API}/projects/P1/f10")
    ws = load_workbook(BytesIO(response.data)).active

    assert response.status_code == 200
    assert [ws.cell(row=9, column=c).value for c in range(6, 9)] == ["ГП", "АР", "КЖ"]


# --- предпросмотр ---


def _summary(selection):
    return plan_actions(selection)["summary"]


def test_preview_new_project():
    selection = matrix(
        [
            obj("O1", "Корпус", [mark("M1", "АР"), mark("M2", "КЖ", number="2")]),
            obj(NULL_OBJECT_ID, "Общий объект", [mark("M3", "ГП")]),
        ]
    )
    actions = plan_actions(selection)["actions"]

    assert [(a["type"], a["kind"], a["name"]) for a in actions] == [
        ("create", "project", "Проект"),
        ("create", "object", "Корпус"),
        ("create", "mark", "АР"),
        ("create", "mark", "КЖ2"),
        ("create", "mark", "ГП"),
    ]
    assert actions[2]["object"] == "Корпус" and actions[4]["object"] is None


def test_preview_removals_and_restores():
    selection = matrix(
        [
            obj(
                "O1",
                "Корпус",
                [
                    mark("M1", "АР", folder="MF1", to_remove=True),
                    mark("M2", "КЖ", folder="MF2", to_restore=True, deleted=True),
                ],
                folder="OF",
            ),
            obj("O2", "Склад", [mark("M1", "АР", folder="MF3", to_remove=True)], folder="OF2", to_remove=True),
        ],
        folder="PF",
    )

    assert _summary(selection) == {"create": 0, "remove": 3, "restore": 1}


def test_preview_unchanged_matrix_is_empty():
    selection = matrix([obj("O1", "Корпус", [mark("M1", "АР", folder="MF1")], folder="OF")], folder="PF")
    assert plan_actions(selection) == {"actions": [], "summary": {"create": 0, "remove": 0, "restore": 0}}


def test_preview_matches_apply(auth_client, vitro):
    """Предпросмотр и фактическое применение должны сходиться по числу создаваемых папок."""
    selection = matrix(
        [
            obj("O1", "Корпус", [mark("M1", "АР"), mark("M2", "КЖ")]),
            obj(NULL_OBJECT_ID, "Общий", [mark("M3", "ГП")]),
        ]
    )
    preview = auth_client.post(f"{API}/projects/P1/structure/preview", json=selection).get_json()

    auth_client.post(f"{API}/projects/P1/structure", json=selection)
    created = len(vitro.updates("CT-PF")) + len(vitro.updates("CT-OF")) + len(vitro.updates("CT-MF"))

    assert preview["summary"]["create"] == created


def test_preview_route_does_not_call_vitro(auth_client, vitro):
    response = auth_client.post(f"{API}/projects/P1/structure/preview", json=matrix([obj("O1", "Корпус", [])]))

    assert response.status_code == 200
    assert vitro.calls == []


def test_preview_rejects_invalid_body(auth_client, vitro):
    assert auth_client.post(f"{API}/projects/P1/structure/preview", json={"id": "P1"}).status_code == 400


# --- чистые функции матрицы ---


def test_ordered_marks_follow_mark_order_then_appearance():
    selection = matrix(
        [
            obj("O1", "A", [mark("M1", "АР"), mark("M2", "КЖ")]),
            obj("O2", "B", [mark("M3", "ГП"), mark("M4", "ОВ", deleted=True)]),
            obj("O3", "C", [mark("M5", "ВК")], deleted=True),
        ]
    )
    selection["mark_order"] = ["M3|", "UNKNOWN|", "M1|"]

    assert list(ordered_active_marks(selection)) == ["M3|", "M1|", "M2|"]


@pytest.mark.parametrize(
    "selection, error",
    [
        (None, "Некорректный формат матрицы"),
        ({"id": "P1", "objects": {}}, "Некорректный формат матрицы"),
        (matrix([obj("O 1", "X", [])]), "идентификатор объекта"),
        (matrix([obj("O1", "X", [mark("M1", "АР", number="100")])]), "номер раздела"),
        (matrix([obj("O1", "X", [mark("M1", "АР", number="01")])]), "номер раздела"),
        ({**matrix([]), "mark_order": "M1|"}, "mark_order"),
    ],
)
def test_validate_matrix_errors(selection, error):
    assert any(error in e for e in validate_matrix(selection))


@pytest.mark.parametrize("number", ["", "1", "99", 7])
def test_validate_matrix_accepts_valid_numbers(number):
    assert validate_matrix(matrix([obj("O1", "X", [mark("M1", "АР", number=number)])])) == []
