from flask import Blueprint, jsonify, current_app, request, url_for, make_response

bp = Blueprint('callback', __name__, url_prefix='/')

def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = current_app.config.get('VITRO_CAD_API_BASE_URL', '*')
    response.headers['Access-Control-Expose-Headers'] = 'Link-Open, Link-Open-New-Tab'
    return response

#Генерирует URL с учетом APPLICATION_ROOT.
def get_external_url(endpoint, **values):
    url = url_for(endpoint, _external=True, **values)
    
    # В production среде нужно убедиться, что URL содержит правильный префикс
    if current_app.config.get('FLASK_CONFIG') == 'production' or not current_app.debug:
        server_name = current_app.config.get('SERVER_NAME')
        application_root = current_app.config.get('APPLICATION_ROOT', '/')
        
        # Проверка, чтобы избежать дублирования префикса
        if server_name and application_root != '/':
            # Обеспечиваем правильный формат URL с префиксом
            scheme = current_app.config.get('PREFERRED_URL_SCHEME', 'https')
            if f"{scheme}://{server_name}{application_root}" not in url:
                # URL не содержит префикс, добавляем его
                parts = url.split(server_name, 1)
                if len(parts) > 1:
                    url = f"{parts[0]}{server_name}{application_root}{parts[1]}"
    return url

#Handle project generation request from Vitro-CAD MP
@bp.route('/callback', methods=['POST'])
def vitro_cad_callback():
    # Validate authorization
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({"exception": {"message": "Отсутствует заголовок Authorization"}}), 401

    try:
        # Validate request data
        data = request.get_json()
        if not data or 'itemIdList' not in data or not data['itemIdList']:
            return jsonify({"exception": {"message": "Некорректный формат запроса. Ожидается itemIdList."}}), 400

        project_id = data['itemIdList'][0]
        token = auth_header

        # Create response with redirect
        response = make_response()
        #generator_url = url_for('edit_project_page_proto', project_id=project_id, _external=True)
        generator_url = get_external_url('edit_project_page_proto', project_id=project_id)
        
        # Add Link-Open header for same-tab redirect
        response.headers['Link-Open-New-Tab'] = generator_url
        
        # Set secure cookie with token
        secure = not current_app.debug
        max_age = current_app.config.get('TOKEN_COOKIE_MAX_AGE', 86400)  # Default: 1 day
        response.set_cookie(
            'mp_token', 
            token, 
            max_age=max_age,
            httponly=True,
            secure=secure,
            samesite='Lax'
        )

        # Add CORS headers
        return add_cors_headers(response)

    except Exception as e:
        current_app.logger.error(f"Error processing callback: {str(e)}")
        return jsonify({"exception": {"message": f"Ошибка обработки запроса: {str(e)}"}}), 500