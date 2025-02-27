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
            return;
        }
    
        $.getJSON(`/data/projects/${projectId}`, function (projectData) {
            console.log("Данные проекта получены:", projectData);
            // Получаем строку selection_matrix из projectData
            var selectionMatrixString = projectData.fieldValueMap.selection_matrix;
    
            // Преобразуем строку selectionMatrixString в JavaScript объект
            var selectionMatrix = JSON.parse(selectionMatrixString);
    
            if (selectionMatrix) {
                for (const objectId in selectionMatrix) {
                    if (selectionMatrix.hasOwnProperty(objectId)) {
                        const markIds = selectionMatrix[objectId];
                        console.log("  objectId:", objectId);
                        console.log("  Значение markIds перед проверкой isArray:", markIds);
    
                        if (Array.isArray(markIds)) {
                            console.log("  markIds (массив):", markIds);
                            markIds.forEach(function (markId) {
                                const lowerObjectId = objectId.toLowerCase();
                                const lowerMarkId = markId.toLowerCase();
                                var checkbox = $(`#selectionMatrix input[type="checkbox"][data-object-id="${lowerObjectId}"][data-mark-id="${lowerMarkId}"]`);
                                if (checkbox.length) {
                                    checkbox.prop('checked', true);
                                } else {
                                    console.warn(`    ПРЕДУПРЕЖДЕНИЕ: Чекбокс НЕ НАЙДЕН для objectId: ${objectId}, markId: ${markId}`);
                                }
                            });
                        } else {
                            console.warn("  ВНИМАНИЕ: markIds НЕ является массивом для objectId:", objectId);
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