from flask import Blueprint, jsonify, current_app, request, url_for, make_response

bp = Blueprint('callback', __name__, url_prefix='/')

#Handle project generation request from Vitro-CAD MP
@bp.route('/callback', methods=['POST'])
def vitro_cad_callback():
    try:
        # Validate authorization
        auth_header = request.headers.get('Authorization')

        if not auth_header:
            return jsonify({"exception": {"message": "Отсутствует заголовок Authorization"}}), 401

        token = auth_header

        # Validate request data
        data = request.get_json()

        if not data or 'itemIdList' not in data or not data['itemIdList']:
            return jsonify({"exception": {"message": "Некорректный формат запроса. Ожидается itemIdList."}}), 400

        if len(data['itemIdList']) != 1:
            return jsonify({"exception": {"message": "Некорректный формат запроса. Ожидается один элемент в itemIdList."}}), 400

        project_id = data['itemIdList'][0]
        
        # Create response with redirect
        response = make_response()
        generator_url = url_for('create_project_page', project_id=project_id, _external=True)
        
        # Add Link-Open header for same-tab redirect
        response.headers['Link-Open-New-Tab'] = generator_url
        response.headers['Access-Control-Allow-Origin'] = current_app.config.get('VITRO_CAD_API_BASE_URL', '*')
        response.headers['Access-Control-Expose-Headers'] = 'Link-Open, Link-Open-New-Tab'
        
        # Set secure cookie with token
        secure = not current_app.debug
        max_age = current_app.config.get('TOKEN_COOKIE_MAX_AGE', 86400)  # Default: 1 day
        response.set_cookie('mp_token', token, max_age=max_age, httponly=True, secure=secure, samesite='Lax')

        return response

    except Exception as e:
        current_app.logger.error(f"Error processing callback: {str(e)}")
        return jsonify({"exception": {"message": f"Ошибка обработки запроса: {str(e)}"}}), 500