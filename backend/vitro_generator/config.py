import os

from dotenv import load_dotenv

# Загружаем переменные окружения из файла .env
load_dotenv()


# Конфигурация приложения
class Config:
    # Vitro-CAD MP API Configuration
    VITRO_CAD_API_BASE_URL = os.getenv("VITRO_CAD_API_BASE_URL")
    VITRO_CAD_ADMIN_USERNAME = os.getenv("VITRO_CAD_ADMIN_USERNAME")
    VITRO_CAD_ADMIN_PASSWORD = os.getenv("VITRO_CAD_ADMIN_PASSWORD")

    PROJECT_LIST_ID = os.getenv("PROJECT_LIST_ID")
    MARK_LIST_ID = os.getenv("MARK_LIST_ID")
    OBJECT_LIST_ID = os.getenv("OBJECT_LIST_ID")
    DOCUMENT_LIST_ID = os.getenv("DOCUMENT_LIST_ID")
    RECYCLE_BIN_LIST_ID = os.getenv("RECYCLE_BIN_LIST_ID")
    SCOPE_LIST_ID = os.getenv("SCOPE_LIST_ID")

    PROJECT_CT_ID = os.getenv("PROJECT_CT_ID")
    CUSTOMER_CT_ID = os.getenv("CUSTOMER_CT_ID")
    OBJECT_CT_ID = os.getenv("OBJECT_CT_ID")
    MARK_CT_ID = os.getenv("MARK_CT_ID")
    SCOPE_CT_ID = os.getenv("SCOPE_CT_ID")

    PROJECT_FOLDER_CT_ID = os.getenv("PROJECT_FOLDER_CT_ID")
    OBJECT_FOLDER_CT_ID = os.getenv("OBJECT_FOLDER_CT_ID")
    MARK_FOLDER_CT_ID = os.getenv("MARK_FOLDER_CT_ID")

    MARK_TEMPLATE_FOLDER_ID = os.getenv("MARK_TEMPLATE_FOLDER_ID")
    PROJECT_TEMPLATE_FOLDER_ID = os.getenv("PROJECT_TEMPLATE_FOLDER_ID")
    PROJECT_TEMPLATE_ANCHOR_NAME = os.getenv("PROJECT_TEMPLATE_ANCHOR_NAME")

    EDIT_PERMISSION_LEVEL_ID = os.getenv("EDIT_PERMISSION_LEVEL_ID")

    VITRO_CAD_API_TIMEOUT = int(os.getenv("VITRO_CAD_API_TIMEOUT", 30))

    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE = os.getenv("LOG_FILE")


# Конфигурация для development
class DevelopmentConfig(Config):
    DEBUG = True


# Конфигурация для тестов: сеть не используется, значения подставляются фикстурами
class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG")


# Конфигурация для production
class ProductionConfig(Config):
    DEBUG = False

    SERVER_NAME = os.getenv("SERVER_NAME")
    PREFERRED_URL_SCHEME = "https"

    # Настройки для безопасности
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_PATH = os.getenv("SESSION_COOKIE_PATH")
    SESSION_COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN")

    # Настройки для прокси (количество прокси-серверов перед приложением)
    PROXY_COUNT = int(os.getenv("PROXY_COUNT", 1))


config = {
    "dev": DevelopmentConfig,
    "prod": ProductionConfig,
    "test": TestingConfig,
}


# Функция для конфигурирования приложения: FLASK_CONFIG (.env) = dev | prod | test
def configure_app(app, config_name):
    app.config.from_object(config[config_name])
    app.config["FLASK_CONFIG"] = config_name  # единственный признак среды для кода приложения
