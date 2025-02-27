$(document).ready(function () {
    function loadProjectsDropdown() {
        $.getJSON('/data/projects', function (projects) { //  Запрос к новому маршруту /data/projects
            var dropdown = $('#projectDropdown'); //  Находим Dropdown проектов по ID
            dropdown.empty(); // Очищаем Dropdown

            dropdown.append($('<option value="">Выберите проект для редактирования</option>')); // Опция-заглушка

            $.each(projects, function (index, project) {
                dropdown.append($('<option></option>').attr('value', project.id).text(project.fieldValueMap.name)); // Используйте item_id и item_name из ответа API Vitro-CAD MP
            });

        }).fail(function () {
            alert('Не удалось загрузить список проектов. Пожалуйста, обновите страницу.');
            $('#projectDropdown').html('<option value="">Ошибка загрузки проектов</option>');
        });
    }

    function loadProjectData(projectId) {
        if (!projectId) {
            return; // Ничего не делаем, если проект не выбран (таблица уже должна быть пустой или с placeholder)
        }
    
        $.getJSON(`/data/projects/${projectId}`, function (projectData) {
            console.log("Данные проекта получены:", projectData);
    
            var selectionMatrix = projectData.fieldValueMap.selection_matrix;
            var projectName = projectData.fieldValueMap.name;
            
            //console.log("selectionMatrix:", selectionMatrix);
            // Теперь нам НЕ НУЖНО заново строить таблицу! Таблица уже должна быть построена при выборе заказчика!
            // Просто находим таблицу и отмечаем чекбоксы
    
            if (selectionMatrix) { // Проверка, что selectionMatrix существует и не null
                for (const objectId in selectionMatrix) { // Итерируем по ключам selectionMatrix, которые теперь являются objectId
                    //console.log('objectId:', objectId);
                    if (selectionMatrix.hasOwnProperty(objectId)) { // Проверка, что ключ - собственное свойство объекта (безопасность)
                        const markIds = selectionMatrix[objectId]; // Получаем массив markIds для текущего objectId
            
                        if (Array.isArray(markIds)) { // Проверка, что markIds - массив
                            markIds.forEach(function (markId) { // Итерируем по массиву markIds
                                // Находим чекбокс по objectId и markId и устанавливаем checked = true
                                const lowerObjectId = objectId.toLowerCase();
                                const lowerMarkId = markId.toLowerCase();
                                var checkbox = $(`#selectionMatrix input[type="checkbox"][data-object-id="${lowerObjectId}"][data-mark-id="${lowerMarkId}"]`);
                                if (checkbox.length) { // Проверяем, найден ли чекбокс
                                    checkbox.prop('checked', true); // Отмечаем чекбокс
                                } else {
                                    console.warn(`Чекбокс для objectId: ${objectId}, markId: ${markId} не найден в таблице.`); // Предупреждение для отладки
                                }
                            });
                        }
                    }
                }
            }
    
        }).fail(function(jqXHR, textStatus, errorThrown) {
            console.error("Ошибка загрузки данных проекта:", textStatus, errorThrown);
            alert("Ошибка загрузки данных проекта. Пожалуйста, попробуйте еще раз.");
        });
    }

    $('#projectDropdown').change(function() { // Обработчик change для Dropdown проектов
        var selectedProjectId = $(this).val();
        console.log('Выбранный ID проекта:', selectedProjectId);
        loadProjectData(selectedProjectId); // Вызываем функцию загрузки данных проекта при выборе проекта

        // *** Включаем кнопку "Сохранить изменения" после выбора заказчика ***
        if (selectedProjectId) { // Проверяем, что заказчик выбран (ID не пустой)
            $('#editProjectBtn').prop('disabled', false); // Включаем кнопку
        } else {
            $('#editProjectBtn').prop('disabled', true);  // Иначе, выключаем кнопку, если заказчик не выбран
        }
    });

    // Загружаем Dropdown проектов на странице edit_project.html
    if ($('#projectDropdown').length) { // Проверяем, есть ли элемент с ID projectDropdown на странице (только на edit_project.html)
        loadProjectsDropdown(); // Загружаем Dropdown проектов только на странице редактирования проекта
    }
});