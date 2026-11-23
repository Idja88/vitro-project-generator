"""Предпросмотр: какие действия выполнит apply_matrix для данной матрицы, без обращений к Vitro-CAD.

Правила зеркалируют process_object / process_mark в services/structure.py — при изменении одного
нужно менять и другое (тесты test_api_v1 сверяют их на одних и тех же матрицах).
"""

from vitro_generator.services.matrix import display_name
from vitro_generator.services.structure import NULL_OBJECT_ID


def _mark_actions(mark, object_name):
    actions = []
    target = {"kind": "mark", "name": display_name(mark), "object": object_name}
    if mark["folder_structure_id"] == "":
        actions.append({"type": "create", **target})
    if mark.get("to_remove") and not mark.get("deleted"):
        actions.append({"type": "remove", **target})
    if mark.get("to_restore") and mark.get("deleted"):
        actions.append({"type": "restore", **target})
    return actions


def plan_actions(matrix):
    """Список действий в порядке выполнения + сводка {"create": n, "remove": n, "restore": n}."""
    actions = []
    if matrix.get("folder_structure_id", "") == "":
        actions.append({"type": "create", "kind": "project", "name": matrix.get("name"), "object": None})

    for obj in matrix["objects"]:
        if obj["id"] == NULL_OBJECT_ID:
            for mark in obj["marks"]:
                actions += _mark_actions(mark, None)
            continue

        target = {"kind": "object", "name": obj["name"], "object": None}
        if obj["folder_structure_id"] == "":
            actions.append({"type": "create", **target})
        if obj.get("to_restore") and obj.get("deleted"):
            actions.append({"type": "restore", **target})
        for mark in obj["marks"]:
            actions += _mark_actions(mark, obj["name"])
        if obj.get("to_remove") and not obj.get("deleted"):
            actions.append({"type": "remove", **target})

    summary = {kind: sum(1 for a in actions if a["type"] == kind) for kind in ("create", "remove", "restore")}
    return {"actions": actions, "summary": summary}
