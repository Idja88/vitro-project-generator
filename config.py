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
    VITRO_CAD_AUTH_TOKEN = os.getenv("VITRO_CAD_AUTH_TOKEN")
    VITRO_CAD_AUTH_TOKEN_MAX_AGE = int(os.getenv('VITRO_CAD_AUTH_TOKEN_MAX_AGE', 86400))

    PROJECT_LIST_ID = os.getenv("PROJECT_LIST_ID")
    MARK_LIST_ID = os.getenv("MARK_LIST_ID")
    OBJECT_LIST_ID = os.getenv("OBJECT_LIST_ID")
    DOCUMENT_LIST_ID = os.getenv("DOCUMENT_LIST_ID")

    PROJECT_CT_ID = os.getenv("PROJECT_CT_ID")
    CUSTOMER_CT_ID = os.getenv("CUSTOMER_CT_ID")
    OBJECT_CT_ID = os.getenv("OBJECT_CT_ID")
    MARK_CT_ID = os.getenv("MARK_CT_ID")

    PROJECT_FOLDER_CT_ID = os.getenv("PROJECT_FOLDER_CT_ID")
    OBJECT_FOLDER_CT_ID = os.getenv("OBJECT_FOLDER_CT_ID")
    MARK_FOLDER_CT_ID = os.getenv("MARK_FOLDER_CT_ID")

# Конфигурация для development
class DevelopmentConfig(Config):
    DEBUG = True

# Конфигурация для production
class ProductionConfig(Config):
    DEBUG = False
    
    SERVER_NAME = os.getenv('SERVER_NAME')
    PREFERRED_URL_SCHEME = 'https'
    
    # Настройки для безопасности
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_PATH = os.getenv('SESSION_COOKIE_PATH')
    SESSION_COOKIE_DOMAIN = os.getenv('COOKIE_DOMAIN')
    
    # Настройки для прокси (количество прокси-серверов перед приложением)
    PROXY_COUNT = int(os.getenv('PROXY_COUNT', 1))

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig  # Конфигурация по умолчанию - development
}

# Функция для конфигурирования приложения
def configure_app(app, config_name=None):
    if not config_name:
        config_name = os.getenv('FLASK_CONFIG') # Определяем имя конфигурации из ENV или используем 'default'
    app.config.from_object(config[config_name]) # Загружаем конфигурацию в app.config