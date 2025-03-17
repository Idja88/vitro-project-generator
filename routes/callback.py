from flask import Blueprint, jsonify, current_app, request, url_for, make_response

bp = Blueprint('callback', __name__, url_prefix='/')

def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = current_app.config.get('VITRO_CAD_API_BASE_URL', '*')
    response.headers['Access-Control-Expose-Headers'] = 'Link-Open, Link-Open-New-Tab'
    return response

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
        generator_url = url_for('edit_project_page_proto', project_id=project_id, _external=True)
        generator_url = generator_url.replace(':5000', '/generator')
        
        # Add Link-Open header for same-tab redirect
        response.headers['Link-Open-New-Tab'] = generator_url
        
        # Add CORS headers
        return add_cors_headers(response)

    except Exception as e:
        current_app.logger.error(f"Error processing callback: {str(e)}")
        return jsonify({"exception": {"message": f"Ошибка обработки запроса: {str(e)}"}}), 500