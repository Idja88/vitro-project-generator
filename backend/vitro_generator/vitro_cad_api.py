import json

import requests
from flask import current_app
from loguru import logger


def _base_url():
    return current_app.config["VITRO_CAD_API_BASE_URL"]


def _timeout():
    return current_app.config.get("VITRO_CAD_API_TIMEOUT", 30)


def _headers(mp_token):
    return {"Authorization": mp_token}


# Получаем токен для доступа к Vitro-CAD MP
def get_mp_token():
    mp_login = {
        "login": current_app.config["VITRO_CAD_ADMIN_USERNAME"],
        "password": current_app.config["VITRO_CAD_ADMIN_PASSWORD"],
    }
    url_string = f"{_base_url()}/api/security/login"
    try:
        with requests.post(url=url_string, json=mp_login, timeout=_timeout()) as response:
            response.raise_for_status()
            return response.json().get("token")
    except requests.exceptions.RequestException as e:
        logger.error("Ошибка получения токена Vitro-CAD MP: {}", e)
        return None


# Создаем/обновляем элементы списка в Vitro-CAD MP. Возвращает список созданных/обновлённых элементов или None
def update_mp_list(mp_token, data):
    url_string = f"{_base_url()}/api/item/update"
    # По новой документации Vitro-CAD MP (/api/item/Update) тело должно быть multipart/form-data с частью itemListJson.
    item_update_request = {"itemListJson": (None, json.dumps(data))}
    try:
        with requests.post(
            url=url_string,
            headers=_headers(mp_token),
            files=item_update_request,
            timeout=_timeout(),
        ) as response:
            response.raise_for_status()
            result = response.json()
            logger.debug("update_mp_list: {} элемент(ов) → {}", len(data), result)
            return result
    except requests.exceptions.RequestException as e:
        logger.error("Ошибка update_mp_list (data={}): {}", data, e)
        return None


# Получаем элемент списка по ID из Vitro-CAD MP
def get_mp_item(mp_token, item_id, query=None):
    url_string = f"{_base_url()}/api/item/get/{item_id}"
    payload = {"query": query} if query else None
    try:
        with requests.post(url=url_string, headers=_headers(mp_token), json=payload, timeout=_timeout()) as response:
            response.raise_for_status()
            response_json = response.json()
            if response_json:
                return response_json
            logger.warning("get_mp_item: пустой ответ для элемента {}", item_id)
            return None
    except requests.exceptions.RequestException as e:
        logger.error("Ошибка get_mp_item (item_id={}): {}", item_id, e)
        return None


# Получаем дочерние элементы списка из Vitro-CAD MP (рекурсивно или только первый уровень)
def get_mp_children(mp_token, parent_id, recursive=False, query=None):
    endpoint = "getRecursive" if recursive else "getList"
    url_string = f"{_base_url()}/api/item/{endpoint}/{parent_id}"
    payload = {"query": query} if query else None
    try:
        with requests.post(url=url_string, headers=_headers(mp_token), json=payload, timeout=_timeout()) as response:
            response.raise_for_status()
            result = response.json()
            logger.debug(
                "get_mp_children({}, recursive={}, query={!r}) → {} элемент(ов)",
                parent_id,
                recursive,
                query,
                len(result) if isinstance(result, list) else "?",
            )
            return result
    except requests.exceptions.RequestException as e:
        logger.error(
            "Ошибка get_mp_children (parent_id={}, recursive={}, query={!r}): {}",
            parent_id,
            recursive,
            query,
            e,
        )
        return None


# Копируем элементы списка в Vitro-CAD MP. Возвращает True при успехе, None при ошибке
def copy_mp_item(mp_token, to_item_id, data):
    url_string = f"{_base_url()}/api/item/copy/{to_item_id}"
    try:
        with requests.post(url=url_string, headers=_headers(mp_token), json=data, timeout=_timeout()) as response:
            response.raise_for_status()
            logger.debug("copy_mp_item: {} элемент(ов) скопировано в {}", len(data), to_item_id)
            return True
    except requests.exceptions.RequestException as e:
        logger.error("Ошибка copy_mp_item (to_item_id={}): {}", to_item_id, e)
        return None


# Удаляем элементы списка в Vitro-CAD MP (в корзину)
def delete_mp_item(mp_token, data):
    url_string = f"{_base_url()}/api/item/delete"
    try:
        with requests.post(url=url_string, headers=_headers(mp_token), json=data, timeout=_timeout()) as response:
            response.raise_for_status()
            result = response.json()
            logger.debug("delete_mp_item: {} → {}", data, result)
            return result
    except requests.exceptions.RequestException as e:
        logger.error("Ошибка delete_mp_item (data={}): {}", data, e)
        return None


# Восстанавливаем элемент списка из корзины. Возвращает True при успехе, None при ошибке
def restore_mp_item(mp_token, item_id):
    url_string = f"{_base_url()}/api/item/restore/{item_id}"
    try:
        with requests.post(url=url_string, headers=_headers(mp_token), timeout=_timeout()) as response:
            response.raise_for_status()
            logger.debug("restore_mp_item: элемент {} восстановлен", item_id)
            return True
    except requests.exceptions.RequestException as e:
        logger.error("Ошибка restore_mp_item (item_id={}): {}", item_id, e)
        return None


# Устанавливаем уникальные права на элемент. Возвращает True при успехе, None при ошибке
def set_mp_item_unique_permission(mp_token, data):
    url_string = f"{_base_url()}/api/security/setItemUniquePermission"
    try:
        with requests.post(url=url_string, headers=_headers(mp_token), json=data, timeout=_timeout()) as response:
            response.raise_for_status()
            logger.debug("set_mp_item_unique_permission: {}", data)
            return True
    except requests.exceptions.RequestException as e:
        logger.error("Ошибка set_mp_item_unique_permission (data={}): {}", data, e)
        return None
