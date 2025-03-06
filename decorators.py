from functools import wraps
from flask import jsonify
from token_store import GlobalToken
import vitro_cad_api as vc

def require_token(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not GlobalToken.is_valid():
            token_data = vc.get_mp_token()
            if token_data:
                GlobalToken.set_token(token_data)
            else:
                return jsonify({"error": "Не удалось получить токен"}), 500
        
        return f(*args, **kwargs)
    return decorated_function