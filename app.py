from flask import Flask, render_template, request
from config import configure_app
from routes import set, get, callback
from token_store import GlobalToken
from vitro_cad_api import get_mp_token

app = Flask(__name__)

# Конфигурируем приложение
configure_app(app) # Вызываем configure_app для настройки

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

@app.route('/proto')
def edit_project_page_proto():
    project_id = request.args.get('project_id')
    return render_template('proto.html', project_id=project_id)

if __name__ == '__main__':

    # Получаем первичный токен перед запуском
    with app.app_context():
        token_data = get_mp_token()
        if token_data:
            GlobalToken.set_token(token_data)
        else:
            exit(1)

    app.run(debug=app.config['DEBUG']) # Используем app.config['DEBUG'] для режима отладки