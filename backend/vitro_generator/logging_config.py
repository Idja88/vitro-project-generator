import inspect
import logging
import sys

from loguru import logger


class InterceptHandler(logging.Handler):
    """Перенаправляет записи стандартного logging (Flask, Werkzeug, gunicorn) в loguru."""

    def emit(self, record):
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Находим кадр вызова за пределами модуля logging, чтобы loguru показывал реальный источник
        frame, depth = inspect.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def configure_logging(app):
    """Настраивает loguru как единственный приёмник логов приложения.

    Уровень берётся из LOG_LEVEL, при заданном LOG_FILE добавляется файл с ротацией.
    """
    level = app.config.get("LOG_LEVEL", "INFO")
    log_file = app.config.get("LOG_FILE")

    logger.remove()
    logger.add(
        sys.stderr,
        level=level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    )
    if log_file:
        logger.add(
            log_file,
            level=level,
            rotation="10 MB",
            retention="14 days",
            encoding="utf-8",
            enqueue=True,
        )

    # Стандартный logging (включая app.logger и werkzeug) → loguru
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)
    for name in ("werkzeug", "gunicorn.error", "gunicorn.access"):
        std_logger = logging.getLogger(name)
        std_logger.handlers = [InterceptHandler()]
        std_logger.propagate = False

    return logger
