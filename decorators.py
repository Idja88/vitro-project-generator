from functools import wraps
from flask import request, jsonify, current_app

def require_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Пытаемся получить токен из cookie
        token = request.cookies.get('mp_token')
        
        # Если токен не найден в cookie, проверяем заголовки
        if not token:
            if 'Authorization' in request.headers:
                token = request.headers['Authorization']
        
        if not token:
            current_app.logger.error("Token is missing")
            return jsonify({'message': 'Отсутствует токен авторизации!'}), 401
        
        # Передаем токен в функцию
        kwargs['token'] = token
        return f(*args, **kwargs)
    
    return decorated