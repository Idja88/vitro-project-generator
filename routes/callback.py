from flask import Blueprint, jsonify, current_app, request, redirect, url_for, make_response
from functools import wraps
import json

bp = Blueprint('callback', __name__, url_prefix='/')

def add_cors_headers(response):
    """Add required CORS headers for Vitro-CAD MP"""
    response.headers['Access-Control-Allow-Origin'] = current_app.config.get('VITRO_CAD_HOST', '*')
    response.headers['Access-Control-Expose-Headers'] = 'Link-Open, Link-Open-New-Tab'
    return response

#Handle project generation request from Vitro-CAD MP
@bp.route('/callback', methods=['POST'])
def vitro_cad_callback():
    # Prepare request data for logging
    request_data = {
        'headers': dict(request.headers),
        'data': request.get_json(),
        'method': request.method,
        'url': request.url
    }

    # Save request data to JSON file
    with open("request.json", 'w', encoding='utf-8') as f:
        json.dump(request_data, f, ensure_ascii=False, indent=2)

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
        generator_url = url_for('edit_project_page_proto', project_id=project_id)
        
        # Add Link-Open header for same-tab redirect
        response.headers['Link-Open-New-Tab'] = generator_url
        
        # Add CORS headers
        return add_cors_headers(response)

    except Exception as e:
        current_app.logger.error(f"Error processing callback: {str(e)}")
        return jsonify({"exception": {"message": f"Ошибка обработки запроса: {str(e)}"}}), 500