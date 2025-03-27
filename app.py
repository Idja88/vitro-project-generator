from flask import Flask, render_template
from werkzeug.middleware.proxy_fix import ProxyFix
from config import configure_app
from routes import set, get, callback
import os
from prefix_middleware import PrefixMiddleware

def create_app():
    # Инициализация приложения
    app = Flask(__name__)
    
    # Конфигурируем приложение
    env = os.getenv('FLASK_CONFIG', 'default')
    configure_app(app, env)
    
    # Применяем ProxyFix для правильной обработки заголовков за прокси
    if env == 'production':
        proxy_count = int(os.getenv('PROXY_COUNT', 1))
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxy_count, x_proto=proxy_count, x_host=proxy_count, x_prefix=proxy_count)
        
        # Применяем PrefixMiddleware только в production среде
        prefix = os.getenv('PREFIX', '')
        app.wsgi_app = PrefixMiddleware(app.wsgi_app, prefix=prefix)
        
        # Настройки для cookie с учетом префикса
        app.config['SESSION_COOKIE_PATH'] = prefix
        app.config['SESSION_COOKIE_SECURE'] = True
    
    @app.context_processor
    def inject_globals():
        prefix = os.getenv('PREFIX', '')
        return {
            'app_prefix': prefix
        }

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
    application = create_app()
    application.run(host='0.0.0.0', port=5000, debug=application.config.get('DEBUG', False))