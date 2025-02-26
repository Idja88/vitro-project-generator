import sqlite3
import json

DATABASE_FILE = 'projects.db' # Имя файла базы данных SQLite

# Функции для работы с базой данных
def get_db_connection():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row # Для доступа к данным как к словарям
    return conn

# Инициализация базы данных, создаем базу и таблицу, если их нет
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            project_id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_name TEXT NOT NULL,
            selection_matrix_json TEXT,
            vitro_cad_parent_id TEXT,
            vitro_cad_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

# Функции для работы с проектами
def create_project(project_name, selection_matrix, vitro_cad_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO projects (project_name, selection_matrix_json, vitro_cad_id)
            VALUES (?, ?, ?)
        """, (project_name, json.dumps(selection_matrix), vitro_cad_id)) # Сохраняем матрицу как JSON
        conn.commit()
        project_id = cursor.lastrowid # Получаем ID последней вставленной строки
        return project_id
    except sqlite3.Error as e:
        print(f"Ошибка при создании проекта в БД: {e}")
        conn.rollback() # Откатываем транзакцию в случае ошибки
        return None
    finally:
        conn.close()

# Получение списка проектов из БД
def get_project_list():
    conn = get_db_connection()
    cursor = conn.cursor()
    projects = cursor.execute("SELECT project_id, project_name FROM projects").fetchall()
    conn.close()
    return [dict(row) for row in projects] # Преобразуем Row объекты в словари

# Получение данных проекта по его ID
def get_project(project_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    project = cursor.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()
    if project:
        return dict(project) # Преобразуем Row объект в словарь
    return None