import os
from dotenv import load_dotenv

# Загружаем переменные окружения из файла .env
load_dotenv()

# Конфигурация приложения
class Config:
    DEBUG = True # По умолчанию включаем режим отладки

    # Vitro-CAD MP API Configuration
    VITRO_CAD_API_BASE_URL = os.getenv("VITRO_CAD_API_BASE_URL")
    VITRO_CAD_ADMIN_USERNAME = os.getenv("VITRO_CAD_ADMIN_USERNAME")
    VITRO_CAD_ADMIN_PASSWORD = os.getenv("VITRO_CAD_ADMIN_PASSWORD")
    VITRO_CAD_AUTH_TOKEN = os.getenv("VITRO_CAD_AUTH_TOKEN") # Если используется токен

    CUSTOMER_FOLDER_CT_ID = os.getenv("CUSTOMER_FOLDER_CT_ID")
    OBJECT_FOLDER_CT_ID = os.getenv("OBJECT_FOLDER_CT_ID")
    MARKS_LIST_PARENT_ID = os.getenv("MARKS_LIST_PARENT_ID")
    OBJECTS_LIST_PARENT_ID = os.getenv("OBJECTS_LIST_PARENT_ID")

    # Database Configuration (если необходимо, для MVP можно пока опустить)
    # SQLITE_DATABASE_URI = os.getenv("DATABASE_URL") # Пример для SQLite URI

# Конфигурация для development
class DevelopmentConfig(Config):
    """Конфигурация для режима разработки."""
    DEBUG = True

# Конфигурация для production
class ProductionConfig(Config):
    DEBUG = False
    # Здесь можно будет добавить специфические настройки для production, например,
    # другой DATABASE_URL, логирование и т.д.

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig  # Конфигурация по умолчанию - development
}

# Функция для конфигурирования приложения
def configure_app(app, config_name=None):
    if not config_name:
        config_name = os.getenv('FLASK_CONFIG') or 'default' # Определяем имя конфигурации из ENV или используем 'default'
    app.config.from_object(config[config_name]) # Загружаем конфигурацию в app.config