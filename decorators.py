from functools import wraps
from flask import request, jsonify, current_app
from loguru import logger

def require_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Пытаемся получить токен из cookie, который мы установили в callback
        token = request.cookies.get('mp_token')
        
        # Проверяем cookie, который устанавливает основное приложение Vitro-CAD MP
        if not token:
            token = request.cookies.get('Authorization')

        # Если токен не найден в cookie, проверяем конфигурацию приложения
        if not token:
            token = current_app.config['VITRO_CAD_AUTH_TOKEN']

        # Если токен все еще не найден, возвращаем ошибку
        if not token:
            logger.warning("Запрос {} {} отклонён: отсутствует токен авторизации", request.method, request.path)
            return jsonify({'message': 'Отсутствует токен авторизации!'}), 401
        
        # Передаем токен в функцию
        kwargs['token'] = token
        return f(*args, **kwargs)
    
    return decorated