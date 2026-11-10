from functools import wraps
from flask import request, jsonify, current_app, make_response
from loguru import logger

import vitro_cad_api as vc

TOKEN_COOKIE = "mp_token"


def set_token_cookie(response, token):
    """Кладёт токен Vitro-CAD в cookie mp_token."""
    response.set_cookie(
        TOKEN_COOKIE,
        token,
        max_age=24 * 60 * 60,
        httponly=True,
        secure=is_production(),
        samesite="Lax",
    )
    return response


def is_production():
    """Признак боевой среды берётся из конфигурации (FLASK_CONFIG), а не из флага DEBUG."""
    return current_app.config.get("FLASK_CONFIG") == "prod"


def _dev_login_enabled():
    """Автологин админом только вне production и только если в .env заданы учётные данные.

    В production переменные VITRO_CAD_ADMIN_* не задаются, поэтому ветка недостижима вдвойне.
    """
    return bool(
        not is_production()
        and current_app.config.get("VITRO_CAD_ADMIN_USERNAME")
        and current_app.config.get("VITRO_CAD_ADMIN_PASSWORD")
    )


def require_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Cookie, которую мы установили в callback или при dev-автологине
        token = request.cookies.get(TOKEN_COOKIE)

        if token:
            kwargs["token"] = token
            return f(*args, **kwargs)

        # Dev-среда: логинимся через API по учётным данным из .env
        if _dev_login_enabled():
            token = vc.get_mp_token()
            if token:
                logger.info(
                    "Dev-автологин в Vitro-CAD под {} для {} {}",
                    current_app.config["VITRO_CAD_ADMIN_USERNAME"],
                    request.method,
                    request.path,
                )
                kwargs["token"] = token
                response = make_response(f(*args, **kwargs))
                return set_token_cookie(response, token)
            logger.error(
                "Dev-автологин не удался: проверьте VITRO_CAD_ADMIN_USERNAME/PASSWORD"
            )

        logger.warning(
            "Запрос {} {} отклонён: отсутствует токен авторизации",
            request.method,
            request.path,
        )
        return jsonify({"message": "Отсутствует токен авторизации!"}), 401

    return decorated
