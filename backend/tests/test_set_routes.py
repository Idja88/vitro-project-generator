"""Tier 1: POST /api/v1/projects/<project_id>/structure — применение матрицы выбора к дереву папок."""

import json

import pytest

from tests.fakes import ANCHOR_ID, BIN_ITEM_ID, NULL_OBJECT_ID, mark, matrix, obj


def post(client, selection_matrix, project_id="P1"):
    return client.post(
        f"/api/v1/projects/{project_id}/structure",
        data=json.dumps(selection_matrix),
        content_type="application/json",
    )


def call_index(fake, name, predicate=lambda call: True):
    """Индекс первого вызова `name`, удовлетворяющего predicate, в fake.calls."""
    for i, call in enumerate(fake.calls):
        if call[0] == name and predicate(call):
            return i
    raise AssertionError(f"вызов {name} не найден")


# --- S1: новый проект целиком ---


def test_s1_new_project_creates_full_structure(auth_client, vitro):
    selection = matrix(
        [
            obj("O1", "Объект", [mark("M1", "АР")]),
            obj(NULL_OBJECT_ID, "Общий объект", [mark("M1", "АР", number="2")]),
        ]
    )

    response = post(auth_client, selection)

    assert response.status_code == 201
    body = response.get_json()
    result = body["matrix"]

    # идентификаторы папок заполнены
    assert result["folder_structure_id"] != ""
    assert result["objects"][0]["folder_structure_id"] != ""
    assert result["objects"][0]["marks"][0]["folder_structure_id"] != ""
    assert result["objects"][1]["folder_structure_id"] == "", "у псевдо-объекта папки быть не должно"
    assert result["objects"][1]["marks"][0]["folder_structure_id"] != ""

    # папка проекта в корне СХД
    project_folders = vitro.updates("CT-PF")
    assert len(project_folders) == 1
    assert project_folders[0]["parent_id"] == "L-DOC"
    assert project_folders[0]["project_list_lookup"] == "P1"
    assert project_folders[0]["name"] == "Проект"

    # объект под якорем, марка объекта под объектом, марка псевдо-объекта под якорем
    object_folders = vitro.updates("CT-OF")
    assert len(object_folders) == 1
    assert object_folders[0]["parent_id"] == ANCHOR_ID
    assert object_folders[0]["object_list_lookup"] == "O1"

    mark_folders = vitro.updates("CT-MF")
    assert len(mark_folders) == 2
    assert mark_folders[0]["parent_id"] == result["objects"][0]["folder_structure_id"]
    assert mark_folders[0]["sheet_set_lookup"] == "M1"
    assert mark_folders[0]["sheet_set_number"] is None
    assert mark_folders[1]["parent_id"] == ANCHOR_ID
    assert mark_folders[1]["sheet_set_number"] == "2"

    # права: два отдела × две марки, затем уникальные права на каждую папку марки
    scopes = vitro.updates("CT-SCOPE")
    assert len(scopes) == 4
    assert {s["principal"] for s in scopes} == {"DEP-A", "DEP-B"}
    assert all(s["permission_level"] == "PERM-EDIT" for s in scopes)
    assert all(s["parent_id"] == "L-SCOPE" and s["list_id"] == "L-SCOPE" for s in scopes)
    mark_folder_ids = {m["folder_structure_id"] for o in result["objects"] for m in o["marks"]}
    assert {s["source"] for s in scopes} == mark_folder_ids

    permissions = vitro.calls_of("set_mp_item_unique_permission")
    assert len(permissions) == 2
    assert all(p[1]["copy_permission"] is True for p in permissions)
    assert {p[1]["id"] for p in permissions} == mark_folder_ids

    # шаблоны: проект + две марки
    copies = vitro.calls_of("copy_mp_item")
    assert len(copies) == 3
    assert copies[0][1] == result["folder_structure_id"]
    assert copies[0][2] == [{"id": "TPL-PROJ-child", "isChildListCopyRequired": True}]
    assert all(c[2] == [{"id": "TPL-MARK-child", "isChildListCopyRequired": True}] for c in copies[1:])

    # матрица сохранена в карточке проекта
    project_updates = vitro.updates("CT-PROJ")
    assert len(project_updates) == 1
    assert project_updates[0]["id"] == "P1"
    assert project_updates[0]["is_created_by_generator"] is True
    assert project_updates[0]["selection_matrix"] == result

    assert body["project_link"] == f"http://vitro.test/site/S/list/L-DOC/item/{result['folder_structure_id']}"


# --- S2/S3: выбор родителя ---


def test_s2_without_anchor_objects_go_to_project_folder(auth_client, vitro_factory):
    fake = vitro_factory(anchor=False)
    response = post(auth_client, matrix([obj("O1", "Объект", [])], folder="PF"))

    assert response.status_code == 201
    assert fake.updates("CT-OF")[0]["parent_id"] == "PF"


def test_s3_pseudo_object_creates_no_object_folder(auth_client, vitro):
    response = post(auth_client, matrix([obj(NULL_OBJECT_ID, "Общий", [mark("M1", "АР")])], folder="PF"))

    assert response.status_code == 201
    assert vitro.updates("CT-OF") == []
    assert vitro.updates("CT-MF")[0]["parent_id"] == ANCHOR_ID


# --- S4: идемпотентность без изменений ---


def test_s4_unchanged_matrix_is_not_saved(auth_client, vitro):
    selection = matrix(
        [obj("O1", "Объект", [mark("M1", "АР", folder="MF1")], folder="OF")],
        folder="PF",
    )
    response = post(auth_client, selection)

    assert response.status_code == 201
    assert response.get_json()["matrix"] == selection
    assert vitro.calls_of("update_mp_list") == []
    assert vitro.calls_of("copy_mp_item") == []


# --- S5–S7: удаление и восстановление марок ---


def test_s5_mark_to_remove_is_deleted(auth_client, vitro):
    selection = matrix(
        [obj("O1", "Объект", [mark("M1", "АР", folder="MF1", to_remove=True)], folder="OF")],
        folder="PF",
    )
    response = post(auth_client, selection)

    result_mark = response.get_json()["matrix"]["objects"][0]["marks"][0]
    assert vitro.calls_of("delete_mp_item") == [("delete_mp_item", [{"id": "MF1"}])]
    assert result_mark["deleted"] is True
    assert result_mark["to_remove"] is False
    assert vitro.updates("CT-PROJ"), "изменённая матрица должна быть сохранена"


def test_s5b_failed_delete_keeps_flags(auth_client, vitro_factory, log_capture):
    vitro_factory(delete_ok=False)
    selection = matrix(
        [obj("O1", "Объект", [mark("M1", "АР", folder="MF1", to_remove=True)], folder="OF")],
        folder="PF",
    )
    response = post(auth_client, selection)

    assert response.status_code == 201
    result_mark = response.get_json()["matrix"]["objects"][0]["marks"][0]
    assert result_mark["deleted"] is False and result_mark["to_remove"] is True
    assert any(r["level"].name == "ERROR" and "удалить папку MF1" in r["message"] for r in log_capture)


def test_s6_mark_to_restore_is_restored_from_recycle_bin(auth_client, vitro):
    selection = matrix(
        [obj("O1", "Объект", [mark("M2", "КЖ", folder="MF2", to_restore=True, deleted=True)], folder="OF")],
        folder="PF",
    )
    response = post(auth_client, selection)

    bin_lookups = [c for c in vitro.calls_of("get_mp_children") if c[1] == "L-BIN"]
    assert len(bin_lookups) == 1
    assert bin_lookups[0][2] is False
    assert 'GetValueAsGuid("source_id") == "MF2"' in bin_lookups[0][3]
    assert vitro.calls_of("restore_mp_item") == [("restore_mp_item", BIN_ITEM_ID)]

    result_mark = response.get_json()["matrix"]["objects"][0]["marks"][0]
    assert result_mark["deleted"] is False
    assert result_mark["to_restore"] is False


def test_s7_mark_not_in_recycle_bin_keeps_flags(auth_client, vitro_factory):
    fake = vitro_factory(bin_found=False)
    selection = matrix(
        [obj("O1", "Объект", [mark("M2", "КЖ", folder="MF2", to_restore=True, deleted=True)], folder="OF")],
        folder="PF",
    )
    response = post(auth_client, selection)

    assert response.status_code == 201
    assert fake.calls_of("restore_mp_item") == []
    result_mark = response.get_json()["matrix"]["objects"][0]["marks"][0]
    assert result_mark["deleted"] is True and result_mark["to_restore"] is True
    assert fake.updates("CT-PROJ") == [], "матрица не изменилась — сохранять нечего"


def test_s7b_failed_restore_keeps_flags(auth_client, vitro_factory):
    vitro_factory(restore_ok=False)
    selection = matrix(
        [obj("O1", "Объект", [mark("M2", "КЖ", folder="MF2", to_restore=True, deleted=True)], folder="OF")],
        folder="PF",
    )
    response = post(auth_client, selection)

    assert response.status_code == 201
    result_mark = response.get_json()["matrix"]["objects"][0]["marks"][0]
    assert result_mark["deleted"] is True and result_mark["to_restore"] is True


# --- S8/S9: объекты ---


def test_s8_object_to_remove_deletes_marks_first(auth_client, vitro):
    selection = matrix(
        [obj("O1", "Объект", [mark("M1", "АР", folder="MF1", to_remove=True)], folder="OF", to_remove=True)],
        folder="PF",
    )
    response = post(auth_client, selection)

    deleted_ids = [c[1][0]["id"] for c in vitro.calls_of("delete_mp_item")]
    assert deleted_ids == ["MF1", "OF"]
    result_obj = response.get_json()["matrix"]["objects"][0]
    assert result_obj["deleted"] is True and result_obj["to_remove"] is False
    assert result_obj["marks"][0]["deleted"] is True


def test_s9_object_to_restore_runs_before_its_marks(auth_client, vitro):
    selection = matrix(
        [obj("O1", "Объект", [mark("M1", "АР")], folder="OF", to_restore=True, deleted=True)],
        folder="PF",
    )
    response = post(auth_client, selection)

    restore_at = call_index(vitro, "restore_mp_item")
    mark_created_at = call_index(vitro, "update_mp_list", lambda c: c[1][0].get("content_type_id") == "CT-MF")
    assert restore_at < mark_created_at
    result_obj = response.get_json()["matrix"]["objects"][0]
    assert result_obj["deleted"] is False and result_obj["to_restore"] is False
    assert vitro.updates("CT-MF")[0]["parent_id"] == "OF"


# --- S10: номер марки ---


@pytest.mark.parametrize("number, expected", [("", None), ("3", "3"), (1, 1)])
def test_s10_mark_number_is_passed_as_sheet_set_number(auth_client, vitro, number, expected):
    post(auth_client, matrix([obj("O1", "Объект", [mark("M1", "АР", number=number)], folder="OF")], folder="PF"))

    assert vitro.updates("CT-MF")[0]["sheet_set_number"] == expected


# --- S11–S13: права ---


def test_s11_mark_without_departments_skips_permissions(auth_client, vitro_factory, log_capture):
    fake = vitro_factory(departments=None)
    response = post(auth_client, matrix([obj("O1", "Объект", [mark("M1", "АР")], folder="OF")], folder="PF"))

    assert response.status_code == 201
    assert fake.updates("CT-SCOPE") == []
    assert fake.calls_of("set_mp_item_unique_permission") == []
    assert any(r["level"].name == "WARNING" and "не указано подразделение" in r["message"] for r in log_capture)


def test_s12_missing_mark_lookup_is_an_error(auth_client, vitro_factory):
    vitro_factory(mark_lookup_empty=True)
    response = post(auth_client, matrix([obj("O1", "Объект", [mark("M1", "АР")], folder="OF")], folder="PF"))

    assert response.status_code == 500
    assert "Не удалось получить данные марки" in response.get_json()["error"]


def test_s13_failed_unique_permission_is_an_error(auth_client, vitro_factory):
    vitro_factory(permission_ok=False)
    response = post(auth_client, matrix([obj("O1", "Объект", [mark("M1", "АР")], folder="OF")], folder="PF"))

    assert response.status_code == 500
    assert "уникальные права" in response.get_json()["error"]


def test_s13b_failed_scope_item_is_an_error(auth_client, vitro_factory):
    vitro_factory(fail_on={"CT-SCOPE"})
    response = post(auth_client, matrix([obj("O1", "Объект", [mark("M1", "АР")], folder="OF")], folder="PF"))

    assert response.status_code == 500
    assert "назначить права отдела DEP-A" in response.get_json()["error"]


# --- S14/S15: сбои Vitro-CAD ---


def test_s14_api_failure_returns_500_with_message_and_logs(auth_client, vitro_factory, log_capture):
    vitro_factory(fail_on={"CT-OF"})
    response = post(auth_client, matrix([obj("O1", "Объект", [])], folder="PF"))

    assert response.status_code == 500
    assert response.get_json() == {"error": "Не удалось создать папку объекта «Объект»"}
    assert any(
        r["level"].name == "ERROR" and "Не удалось создать папку объекта «Объект»" in r["message"] for r in log_capture
    )


def test_s15_template_copy_failure_is_logged_but_not_fatal(auth_client, vitro_factory, log_capture):
    vitro_factory(copy_ok=False)
    response = post(auth_client, matrix([obj("O1", "Объект", [mark("M1", "АР")])]))

    assert response.status_code == 201
    errors = [r["message"] for r in log_capture if r["level"].name == "ERROR"]
    assert any("скопировать шаблон проекта" in m for m in errors)
    assert any("скопировать шаблон марки" in m for m in errors)


def test_s15b_unexpected_exception_is_logged_with_traceback(auth_client, vitro_factory, log_capture, monkeypatch):
    vitro_factory()
    from vitro_generator.services import structure as set_module

    def boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(set_module, "find_object_parent", boom)
    response = post(auth_client, matrix([obj("O1", "Объект", [])], folder="PF"))

    assert response.status_code == 500
    assert response.get_json() == {"error": "Не удалось создать структуру проекта"}
    assert any(r["exception"] is not None and "Непредвиденная ошибка" in r["message"] for r in log_capture)


# --- S16–S18: контракт маршрута ---


@pytest.mark.parametrize("raw_body", ["null", '{"id": "P1"}', "not json at all", "[]"])
def test_s16_invalid_body_returns_400(auth_client, vitro, raw_body):
    response = auth_client.post("/api/v1/projects/P1/structure", data=raw_body, content_type="application/json")

    assert response.status_code == 400
    assert response.get_json() == {"error": "Некорректный формат матрицы выбора"}
    assert vitro.calls == []


def test_s17_requires_token(client, vitro, prod_env):
    response = post(client, matrix([]))

    assert response.status_code == 401
    assert vitro.calls == []


def test_s18_missing_project_folder_for_link_is_an_error(auth_client, vitro_factory):
    vitro_factory(get_item_none=True)
    response = post(auth_client, matrix([], folder="PF"))

    assert response.status_code == 500
    assert "ссылки" in response.get_json()["error"]


# --- S20: идентификаторы с символами запроса отклоняются (бывшее слабое место №7) ---


def test_s20_non_guid_folder_id_is_rejected(auth_client, vitro):
    hostile_id = 'abc" || item.Id != Guid("'
    selection = matrix(
        [obj("O1", "Объект", [mark("M2", "КЖ", folder=hostile_id, to_restore=True, deleted=True)], folder="OF")],
        folder="PF",
    )
    response = post(auth_client, selection)

    assert response.status_code == 400
    assert all(hostile_id not in (c[3] or "") for c in vitro.calls_of("get_mp_children"))
