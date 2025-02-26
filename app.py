from flask import Flask, render_template
from config import configure_app
from routes import projects, data # Импортируем Blueprints
from database import init_db

app = Flask(__name__)

# Инициализируем базу данных
init_db()

# Конфигурируем приложение
configure_app(app) # Вызываем configure_app для настройки

# Регистрируем Blueprints
app.register_blueprint(projects.bp)
app.register_blueprint(data.bp)

@app.route('/')
def index():
    return render_template('index.html') # Отдаем index.html шаблон

# ... остальной код app.py (например, запуск приложения) ...

if __name__ == '__main__':
    app.run(debug=app.config['DEBUG']) # Используем app.config['DEBUG'] для режима отладки