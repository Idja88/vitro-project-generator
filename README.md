# vitro-project-generator

## Описание
Модуль Генератор Проектов, представялет собой веб приложение Flask, которое использует REST API системы Vitro-CAD MP для централизованного заведения информации о проекте, создания структуры папок этого проекта, и изменения структуры при необходимости.

## Константы, типы элементов и их поля Vitro-CAD MP наличие которых обязательно:

### Карточка проекта (Реестр проектов)
* selection_matrix - данные в json формате
* is_created_by_generator - флаг
* project_company_id - уникальный идентификатор

### Заказчик (Объекты проектирования)
* company_customer_lookup - ссылка на элемент списка "Реестр компаний"

### Объект проектирования (Объекты проектирования)
* object_plan_number - целое число

### Марка комплекта (Марки комплекта)
* code - однострочный текст

### Проект (СХД)
* project_list_lookup - ссылка на элемент списка "Реестр проектов"

### Объект (СХД)
* object_list_lookup - ссылка на элемент списка "Объекты проектирования"

### Комплект (СХД)
* sheet_set_lookup - ссылка на элемент списка "Марки комплекта"
* sheet_set_number - целое число