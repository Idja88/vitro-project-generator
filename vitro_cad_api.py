import requests
import json
from flask import current_app

# Получаем токен для доступа к Vitro-CAD MP
def get_mp_token():
    mp_url = current_app.config['VITRO_CAD_API_BASE_URL']
    mp_login = {
        "login": current_app.config['VITRO_CAD_ADMIN_USERNAME'],
        "password": current_app.config['VITRO_CAD_ADMIN_PASSWORD']
    }
    url_string = f"{mp_url}/api/security/login"
    try:
        with requests.post(url=url_string, json=mp_login) as response:
            response.raise_for_status()
            response_json = response.json()
            token = response_json.get('token')
            return token
    except requests.exceptions.RequestException as e:
        print(f"Error getting MP token: {e}")
        return None

# Создаем элемент списка в Vitro-CAD MP, будет использоваться для создания структуры
def update_mp_list(mp_token, data):
    mp_url = current_app.config['VITRO_CAD_API_BASE_URL']
    url_string = f"{mp_url}/api/item/update"
    item_list_json = json.dumps(data)
    item_update_request = {'itemListJson': item_list_json}
    headers = {'Authorization': mp_token}
    try:
        with requests.post(url=url_string, headers=headers, data=item_update_request) as response:
            response.raise_for_status()
            response_json = response.json()
            return response_json
    except requests.exceptions.RequestException as e:
        print(f"Error updating MP list: {e}")
        return None

# Получаем элемент списка по ID из Vitro-CAD MP
def get_mp_item(mp_token, item_id, query=None):
    mp_url = current_app.config['VITRO_CAD_API_BASE_URL']
    url_string = f"{mp_url}/api/item/get/{item_id}"
    headers = {'Authorization': mp_token}
    payload = {"query": query} if query else None
    try:
        with requests.post(url=url_string, headers=headers, json=payload) as response:
            response.raise_for_status()
            response_json = response.json()
            if response_json:
                return response_json
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error looking up MP list item by ID: {e}")
        return None

# Получаем дочерние элементы списка из Vitro-CAD MP, используя разные методы рекурсивного или обычного получения
def get_mp_children(mp_token, parent_id, recursive=False, query=None):
    mp_url = current_app.config['VITRO_CAD_API_BASE_URL']
    endpoint = "getRecursive" if recursive else "getList"
    url_string = f"{mp_url}/api/item/{endpoint}/{parent_id}"
    headers = {'Authorization': mp_token}
    payload = {"query": query} if query else None
    try:
        with requests.post(url=url_string, headers=headers, json=payload) as response:
            response.raise_for_status()
            response_json = response.json()
            return response_json
    except requests.exceptions.RequestException as e:
        print(f"Error getting MP children (parent_id: {parent_id}, recursive: {recursive}): {e}")
        return None

# Копируем элемент списка в Vitro-CAD MP
def copy_mp_item(mp_token, to_item_id, data):
    mp_url = current_app.config['VITRO_CAD_API_BASE_URL']
    url_string = f"{mp_url}/api/item/copy/{to_item_id}"
    headers = {'Authorization': mp_token}
    try:
        with requests.post(url=url_string, headers=headers, json=data) as response:
            response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error copying MP item (item_id: {to_item_id}): {e}")
        return None

# Удаляем элемент списка в Vitro-CAD MP
def delete_mp_item(mp_token, data):
    mp_url = current_app.config['VITRO_CAD_API_BASE_URL']
    url_string = f"{mp_url}/api/item/delete"
    headers = {'Authorization': mp_token}
    try:
        with requests.post(url=url_string, headers=headers, json=data) as response:
            response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error deleting MP items: {e}")
        return None