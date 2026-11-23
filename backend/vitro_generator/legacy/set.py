import copy
from flask import Blueprint, jsonify, request, current_app
from jsondiff import diff
from loguru import logger
from vitro_generator import vitro_cad_api as vc
from vitro_generator.auth import require_token

bp = Blueprint("set", __name__, url_prefix="/set")

# Псевдо-объект: марки создаются непосредственно в папке проекта (под якорем), без папки объекта
NULL_OBJECT_ID = "00000000-0000-0000-0000-000000000000"


class VitroApiError(Exception):
    """Vitro-CAD MP вернул ошибку или пустой ответ там, где ожидались данные."""


def _first_item(result, error_message):
    """Проверяет ответ update_mp_list и возвращает первый созданный/обновлённый элемент."""
    if not result:
        raise VitroApiError(error_message)
    return result[0]


# Обновляем информацию о проекте матрицей выбора
def update_project_info(token, project_data):
    """Сохраняет матрицу выбора в карточке проекта и ставит флаг is_created_by_generator."""
    project_income_data = [
        {
            "list_id": current_app.config["PROJECT_LIST_ID"],
            "content_type_id": current_app.config["PROJECT_CT_ID"],
            "id": project_data["id"],
            "name": project_data["name"],
            "selection_matrix": project_data,
            "is_created_by_generator": True,
        }
    ]

    result = vc.update_mp_list(token, project_income_data)
    _first_item(result, "Не удалось сохранить матрицу выбора в карточке проекта")
    logger.info("Матрица выбора проекта {} сохранена", project_data["id"])
    return result


# Создание папки проекта
def create_project_folder(token, parent_id, project_data):
    """Создает папку проекта в СХД. Возвращает созданный элемент."""
    if parent_id is None:
        parent_id = current_app.config["DOCUMENT_LIST_ID"]

    project_folder_income_data = [
        {
            "list_id": current_app.config["DOCUMENT_LIST_ID"],
            "parent_id": parent_id,
            "content_type_id": current_app.config["PROJECT_FOLDER_CT_ID"],
            "name": project_data["name"],
            "project_list_lookup": project_data["id"],
        }
    ]

    folder = _first_item(
        vc.update_mp_list(token, project_folder_income_data),
        f"Не удалось создать папку проекта «{project_data['name']}»",
    )
    logger.info("Создана папка проекта «{}» ({})", project_data["name"], folder["id"])
    return folder


# Создание папки объекта
def create_object_folder(token, parent_id, object_data):
    """Создает папку объекта. Возвращает созданный элемент."""
    object_folder_income_data = [
        {
            "list_id": current_app.config["DOCUMENT_LIST_ID"],
            "parent_id": parent_id,
            "content_type_id": current_app.config["OBJECT_FOLDER_CT_ID"],
            "name": object_data["name"],
            "object_list_lookup": object_data["id"],
        }
    ]

    folder = _first_item(
        vc.update_mp_list(token, object_folder_income_data),
        f"Не удалось создать папку объекта «{object_data['name']}»",
    )
    logger.info(
        "Создана папка объекта «{}» ({}) в {}",
        object_data["name"],
        folder["id"],
        parent_id,
    )
    return folder


# Создание папки марки
def create_mark_folder(token, parent_id, mark_data):
    """Создает папку марки (комплекта). Возвращает созданный элемент."""
    mark_number = None if mark_data["number"] == "" else mark_data["number"]

    mark_folder_income_data = [
        {
            "list_id": current_app.config["DOCUMENT_LIST_ID"],
            "parent_id": parent_id,
            "content_type_id": current_app.config["MARK_FOLDER_CT_ID"],
            "name": mark_data["name"],
            "sheet_set_lookup": mark_data["id"],
            "sheet_set_number": mark_number,
        }
    ]

    folder = _first_item(
        vc.update_mp_list(token, mark_folder_income_data),
        f"Не удалось создать папку марки «{mark_data['name']}{mark_data['number']}»",
    )
    logger.info(
        "Создана папка марки «{}{}» ({}) в {}",
        mark_data["name"],
        mark_data["number"],
        folder["id"],
        parent_id,
    )
    return folder


# Подготовка данных шаблонов для копирования
def prepare_template_data(token, template_folder_id):
    """Получает дочерние элементы папки-шаблона и формирует список для copy_mp_item."""
    template_children = vc.get_mp_children(token, template_folder_id, recursive=False)

    if template_children is None:
        logger.warning(
            "Не удалось получить содержимое шаблона {}; шаблон копироваться не будет",
            template_folder_id,
        )
        return []

    return [
        {"id": child["id"], "isChildListCopyRequired": True}
        for child in template_children
    ]


def copy_template(token, target_folder_id, template_data, label):
    """Копирует подготовленный шаблон в папку. Ошибка не прерывает создание структуры, но логируется."""
    if not template_data:
        return
    if not vc.copy_mp_item(token, target_folder_id, template_data):
        logger.error(
            "Не удалось скопировать шаблон {} в папку {}", label, target_folder_id
        )


def delete_folder(token, folder_id):
    """Удаляет папку в корзину. Возвращает True при успехе."""
    deleted = vc.delete_mp_item(token, [{"id": folder_id}])
    if not deleted:
        logger.error("Не удалось удалить папку {}", folder_id)
        return False
    logger.info("Папка {} удалена в корзину", folder_id)
    return True


def restore_folder_from_recycle_bin(token, folder_id):
    """Ищет папку в корзине по source_id и восстанавливает её. Возвращает True при успехе."""
    bin_items = vc.get_mp_children(
        token,
        current_app.config["RECYCLE_BIN_LIST_ID"],
        recursive=False,
        query=f'item => item.GetValueAsGuid("source_id") == "{folder_id}"',
    )
    if not bin_items:
        logger.warning(
            "Папка {} не найдена в корзине, восстановление пропущено", folder_id
        )
        return False

    if not vc.restore_mp_item(token, bin_items[0]["id"]):
        logger.error("Не удалось восстановить папку {} из корзины", folder_id)
        return False

    logger.info("Папка {} восстановлена из корзины", folder_id)
    return True


def set_folder_permission(token, folder):
    """Назначает отделам марки права редактирования на папку марки через «Разрывы прав»."""
    folder_id = folder["id"]
    folder_name = folder["fieldValueMap"]["name"]
    mark_id = folder["fieldValueMap"]["sheet_set_lookup"]["id"]

    # Находим принадлежность марки к отделу(ам)
    mark_info_data = vc.get_mp_children(
        token,
        current_app.config["MARK_LIST_ID"],
        recursive=False,
        query=f'item => item.Id == Guid("{mark_id}")',
    )

    if not mark_info_data:
        raise VitroApiError(
            f"Не удалось получить данные марки для папки «{folder_name}»"
        )

    departments = mark_info_data[0]["fieldValueMap"].get("principal_lookup")
    if not departments:
        logger.warning(
            "У марки «{}» не указано подразделение, права на папку {} не назначены",
            folder_name,
            folder_id,
        )
        return None

    # Если у марки несколько отделов, создаём разрыв прав для каждого
    for department in departments:
        scope_income_data = [
            {
                "list_id": current_app.config["SCOPE_LIST_ID"],
                "content_type_id": current_app.config["SCOPE_CT_ID"],
                "parent_id": current_app.config["SCOPE_LIST_ID"],
                "name": f"Разрывы прав - {folder_name}",
                "source": folder_id,
                "principal": department["id"],
                "permission_level": current_app.config["EDIT_PERMISSION_LEVEL_ID"],
            }
        ]
        _first_item(
            vc.update_mp_list(token, scope_income_data),
            f"Не удалось назначить права отдела {department['id']} на папку «{folder_name}»",
        )

    # Переключаем папку на уникальные права
    if not vc.set_mp_item_unique_permission(
        token, {"id": folder_id, "copy_permission": True}
    ):
        raise VitroApiError(
            f"Не удалось включить уникальные права на папке «{folder_name}»"
        )

    logger.info(
        "Права на папку «{}» ({}) назначены {} отделу(ам)",
        folder_name,
        folder_id,
        len(departments),
    )
    return True


def process_mark(token, parent_id, mark, mark_template_data):
    """Приводит папку марки в соответствие с флагами матрицы: создать / удалить / восстановить.

    Мутирует переданный словарь марки (folder_structure_id, to_remove, to_restore, deleted).
    """
    if mark["folder_structure_id"] == "":
        mark_folder = create_mark_folder(token, parent_id, mark)
        set_folder_permission(token, mark_folder)
        copy_template(token, mark_folder["id"], mark_template_data, "марки")
        mark["folder_structure_id"] = mark_folder["id"]

    if mark["to_remove"] and not mark["deleted"]:
        if delete_folder(token, mark["folder_structure_id"]):
            mark["to_remove"] = False
            mark["deleted"] = True

    if mark["to_restore"] and mark["deleted"]:
        if restore_folder_from_recycle_bin(token, mark["folder_structure_id"]):
            mark["to_restore"] = False
            mark["deleted"] = False

    return mark


def process_object(token, parent_id, obj, mark_template_data):
    """Приводит папку объекта и его марок в соответствие с флагами матрицы. Мутирует obj."""
    if obj["id"] == NULL_OBJECT_ID:
        # Общий объект: марки создаются прямо под родителем, папка объекта не нужна
        for mark in obj["marks"]:
            process_mark(token, parent_id, mark, mark_template_data)
        return obj

    if obj["folder_structure_id"] == "":
        object_folder = create_object_folder(token, parent_id, obj)
        obj["folder_structure_id"] = object_folder["id"]

    if obj["to_restore"] and obj["deleted"]:
        if restore_folder_from_recycle_bin(token, obj["folder_structure_id"]):
            obj["to_restore"] = False
            obj["deleted"] = False

    for mark in obj["marks"]:
        process_mark(token, obj["folder_structure_id"], mark, mark_template_data)

    if obj["to_remove"] and not obj["deleted"]:
        if delete_folder(token, obj["folder_structure_id"]):
            obj["to_remove"] = False
            obj["deleted"] = True

    return obj


def find_object_parent(token, project_folder_id):
    """Возвращает ID якоря шаблона внутри папки проекта или саму папку проекта, если якоря нет."""
    anchor_name = current_app.config["PROJECT_TEMPLATE_ANCHOR_NAME"]
    anchor_data = vc.get_mp_children(
        token,
        project_folder_id,
        recursive=True,
        query=f'item => item.GetValueAsString("name") == "{anchor_name}"',
    )
    if anchor_data:
        logger.debug("Якорь «{}» найден: {}", anchor_name, anchor_data[0]["id"])
        return anchor_data[0]["id"]

    logger.debug(
        "Якорь «{}» не найден, объекты создаются в корне папки проекта {}",
        anchor_name,
        project_folder_id,
    )
    return project_folder_id


# Создаем структуру проекта
@bp.route("/create/<project_id>", methods=["POST"])
@require_token
def create_project_structure(token, project_id):
    request_data = request.get_json(silent=True)
    if not isinstance(request_data, dict) or "objects" not in request_data:
        logger.warning(
            "create_project_structure {}: некорректное тело запроса", project_id
        )
        return jsonify({"error": "Некорректный формат матрицы выбора"}), 400

    selection_matrix = copy.deepcopy(request_data)
    logger.info(
        "Применение матрицы выбора к проекту {} ({} объектов)",
        project_id,
        len(selection_matrix["objects"]),
    )

    try:
        # Подготавливаем данные шаблонов
        project_template_data = prepare_template_data(
            token, current_app.config["PROJECT_TEMPLATE_FOLDER_ID"]
        )
        mark_template_data = prepare_template_data(
            token, current_app.config["MARK_TEMPLATE_FOLDER_ID"]
        )

        # Создаём папку проекта, если её ещё нет
        if selection_matrix["folder_structure_id"] == "":
            project_folder = create_project_folder(
                token, parent_id=None, project_data=selection_matrix
            )
            selection_matrix["folder_structure_id"] = project_folder["id"]
            copy_template(token, project_folder["id"], project_template_data, "проекта")

        object_parent_id = find_object_parent(
            token, selection_matrix["folder_structure_id"]
        )

        for obj in selection_matrix["objects"]:
            process_object(token, object_parent_id, obj, mark_template_data)

        # Сохраняем матрицу, если обработка её изменила
        if diff(selection_matrix, request_data):
            update_project_info(token, selection_matrix)
        else:
            logger.info(
                "Матрица выбора проекта {} не изменилась, сохранение не требуется",
                project_id,
            )

        # Формируем ссылку на папку проекта
        project_folder = vc.get_mp_item(token, selection_matrix["folder_structure_id"])
        if not project_folder:
            raise VitroApiError(
                "Не удалось получить папку проекта для формирования ссылки"
            )
        project_link = (
            f"{current_app.config['VITRO_CAD_API_BASE_URL']}/site/{project_folder['siteId']}"
            f"/list/{project_folder['listId']}/item/{project_folder['id']}"
        )

        logger.info("Структура проекта {} успешно обработана", project_id)
        return jsonify({"matrix": selection_matrix, "project_link": project_link}), 201

    except VitroApiError as e:
        logger.error(
            "Ошибка Vitro-CAD при создании структуры проекта {}: {}", project_id, e
        )
        return jsonify({"error": str(e)}), 500

    except Exception:
        logger.exception(
            "Непредвиденная ошибка при создании структуры проекта {}", project_id
        )
        return jsonify({"error": "Не удалось создать структуру проекта"}), 500


# Обновляем структуру проекта (заглушка: возвращает входные данные без изменений)
@bp.route("/update/<project_id>", methods=["POST"])
@require_token
def update_project_structure(token, project_id):
    new_selection_matrix = request.get_json()
    return jsonify(new_selection_matrix), 201
