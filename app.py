from flask import Flask, render_template
from werkzeug.middleware.proxy_fix import ProxyFix
from config import Config, configure_app
from routes import set, get, callback
import os

def create_app(config_class=Config):

    # Инициализация приложения с учетом production-настроек
    env = os.getenv('FLASK_CONFIG')
    
    if env == 'production':
        static_url_path = f"{os.getenv('APPLICATION_ROOT')}/static"
        static_folder = 'static'
    else:
        static_url_path = '/static'
        static_folder = 'static'

    app = Flask(__name__, static_url_path=static_url_path, static_folder=static_folder)

    # Конфигурируем приложение
    configure_app(app, env) # Вызываем configure_app для настройки

        # Настройка ProxyFix для работы за прокси
    if env == 'production':
        proxy_count = app.config.get('PROXY_COUNT', 1)
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxy_count, x_proto=proxy_count, x_host=proxy_count, x_prefix=proxy_count)

    # Регистрируем Blueprints
    app.register_blueprint(set.bp)
    app.register_blueprint(get.bp)
    app.register_blueprint(callback.bp)

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/create')
    def create_project_page():
        return render_template('create.html')

    @app.route('/edit')
    def edit_project_page():
        return render_template('edit.html')

    @app.route('/proto/<project_id>')
    def edit_project_page_proto(project_id):
        return render_template('proto.html', project_id=project_id)

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=app.config['DEBUG']) # Используем app.config['DEBUG'] для режима отладки