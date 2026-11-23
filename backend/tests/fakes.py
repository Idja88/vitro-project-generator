"""Заглушка Vitro-CAD MP и фабрики матриц выбора для тестов.

FakeVitro воспроизводит контракт функций vitro_cad_api: те же сигнатуры, те же формы ответов
(список элементов с id/fieldValueMap, None при ошибке, True при успехе), без сети.
Все вызовы записываются в `calls` для проверки порядка и аргументов.
"""

# Фейковые идентификаторы, совпадают с переменными окружения из conftest.py
IDS = {
    "PROJECT_LIST_ID": "L-PROJ",
    "MARK_LIST_ID": "L-MARK",
    "OBJECT_LIST_ID": "L-OBJ",
    "DOCUMENT_LIST_ID": "L-DOC",
    "RECYCLE_BIN_LIST_ID": "L-BIN",
    "SCOPE_LIST_ID": "L-SCOPE",
    "PROJECT_CT_ID": "CT-PROJ",
    "CUSTOMER_CT_ID": "CT-CUST",
    "OBJECT_CT_ID": "CT-OBJ",
    "MARK_CT_ID": "CT-MARK",
    "SCOPE_CT_ID": "CT-SCOPE",
    "PROJECT_FOLDER_CT_ID": "CT-PF",
    "OBJECT_FOLDER_CT_ID": "CT-OF",
    "MARK_FOLDER_CT_ID": "CT-MF",
    "MARK_TEMPLATE_FOLDER_ID": "TPL-MARK",
    "PROJECT_TEMPLATE_FOLDER_ID": "TPL-PROJ",
    "PROJECT_TEMPLATE_ANCHOR_NAME": "Якорь",
    "EDIT_PERMISSION_LEVEL_ID": "PERM-EDIT",
}

NULL_OBJECT_ID = "00000000-0000-0000-0000-000000000000"
ANCHOR_ID = "ANCHOR"
BIN_ITEM_ID = "BIN-ITEM"
DEFAULT_DEPARTMENTS = [{"id": "DEP-A"}, {"id": "DEP-B"}]


class FakeVitro:
    """Подменяет модуль vitro_cad_api. Поведение настраивается аргументами конструктора."""

    FUNCTIONS = (
        "get_mp_token",
        "update_mp_list",
        "get_mp_item",
        "get_mp_children",
        "copy_mp_item",
        "delete_mp_item",
        "restore_mp_item",
        "set_mp_item_unique_permission",
    )

    def __init__(
        self,
        fail_on=(),
        anchor=True,
        bin_found=True,
        departments=DEFAULT_DEPARTMENTS,
        mark_lookup_empty=False,
        copy_ok=True,
        delete_ok=True,
        restore_ok=True,
        permission_ok=True,
        items=None,
        get_item_none=False,
        login_ok=True,
    ):
        self.calls = []
        self.login_ok = login_ok               # get_mp_token: "ADMIN-TOKEN" или None
        self.counter = 0
        self.fail_on = set(fail_on)          # content_type_id, на которых update_mp_list вернёт None
        self.anchor = anchor                 # найден ли якорь шаблона в папке проекта
        self.bin_found = bin_found           # находится ли папка в корзине при восстановлении
        self.departments = departments       # principal_lookup марки (None/[] = подразделение не указано)
        self.mark_lookup_empty = mark_lookup_empty  # поиск марки в L-MARK вернёт []
        self.copy_ok = copy_ok
        self.delete_ok = delete_ok
        self.restore_ok = restore_ok
        self.permission_ok = permission_ok
        self.items = items                   # id -> элемент для get_mp_item; None = универсальный ответ
        self.get_item_none = get_item_none   # get_mp_item всегда None

    # --- вспомогательные методы для assert'ов ---

    def calls_of(self, name):
        return [c for c in self.calls if c[0] == name]

    def updates(self, ct_id=None):
        """Payload'ы update_mp_list (первый элемент каждого запроса), опционально по content_type_id."""
        payloads = [c[1][0] for c in self.calls_of("update_mp_list")]
        if ct_id is None:
            return payloads
        return [p for p in payloads if p.get("content_type_id") == ct_id]

    def _new_id(self, prefix):
        self.counter += 1
        return f"{prefix}-{self.counter}"

    # --- контракт vitro_cad_api ---

    def get_mp_token(self):
        self.calls.append(("get_mp_token",))
        return "ADMIN-TOKEN" if self.login_ok else None

    def update_mp_list(self, token, data):
        self.calls.append(("update_mp_list", data))
        payload = data[0]
        if payload.get("content_type_id") in self.fail_on:
            return None
        item = dict(payload)
        item.setdefault("id", self._new_id("NEW"))
        item["fieldValueMap"] = {
            "name": payload.get("name"),
            "sheet_set_lookup": {"id": payload.get("sheet_set_lookup")},
        }
        return [item]

    def get_mp_children(self, token, parent_id, recursive=False, query=None):
        self.calls.append(("get_mp_children", parent_id, recursive, query))
        if parent_id in (IDS["MARK_TEMPLATE_FOLDER_ID"], IDS["PROJECT_TEMPLATE_FOLDER_ID"]):
            return [{"id": f"{parent_id}-child"}]
        if parent_id == IDS["MARK_LIST_ID"]:
            if self.mark_lookup_empty:
                return []
            return [{"id": "M1", "fieldValueMap": {"principal_lookup": self.departments}}]
        if parent_id == IDS["RECYCLE_BIN_LIST_ID"]:
            return [{"id": BIN_ITEM_ID}] if self.bin_found else []
        if query and IDS["PROJECT_TEMPLATE_ANCHOR_NAME"] in query:
            return [{"id": ANCHOR_ID}] if self.anchor else []
        return []

    def get_mp_item(self, token, item_id, query=None):
        self.calls.append(("get_mp_item", item_id))
        if self.get_item_none:
            return None
        if self.items is not None:
            return self.items.get(item_id)
        return {"id": item_id, "siteId": "S", "listId": IDS["DOCUMENT_LIST_ID"]}

    def copy_mp_item(self, token, to_item_id, data):
        self.calls.append(("copy_mp_item", to_item_id, data))
        return True if self.copy_ok else None

    def delete_mp_item(self, token, data):
        self.calls.append(("delete_mp_item", data))
        return [{"id": d["id"]} for d in data] if self.delete_ok else None

    def restore_mp_item(self, token, item_id):
        self.calls.append(("restore_mp_item", item_id))
        return True if self.restore_ok else None

    def set_mp_item_unique_permission(self, token, data):
        self.calls.append(("set_mp_item_unique_permission", data))
        return True if self.permission_ok else None


# --- фабрики матрицы выбора ---

def mark(id_, name, number="", folder="", to_remove=False, to_restore=False, deleted=False):
    return {
        "id": id_,
        "name": name,
        "number": number,
        "folder_structure_id": folder,
        "to_remove": to_remove,
        "to_restore": to_restore,
        "deleted": deleted,
    }


def obj(id_, name, marks, number="1", folder="", to_remove=False, to_restore=False, deleted=False):
    return {
        "id": id_,
        "name": name,
        "number": number,
        "folder_structure_id": folder,
        "marks": marks,
        "to_remove": to_remove,
        "to_restore": to_restore,
        "deleted": deleted,
    }


def matrix(objects, folder="", id_="P1", name="Проект"):
    return {"id": id_, "name": name, "folder_structure_id": folder, "objects": objects}
