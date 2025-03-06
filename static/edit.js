$(document).ready(function () {
    var marks = []; // Массив для хранения марок комплектов
    var objects = []; // Массив для хранения объектов проектирования
    var dataTable; // Переменная для хранения объекта DataTables

    // *** Код для загрузки и заполнения Dropdown заказчиков ***
    function loadCustomersDropdown() {
        $.getJSON('/get/customers', function (customers) {
            var dropdown = $('#customerDropdown'); // Находим Dropdown по id
            dropdown.empty(); // Очищаем Dropdown от начальной опции "Загрузка..."

            // Добавляем опцию-заглушку "Выберите заказчика" (необязательно, но полезно)
            dropdown.append($('<option value="">Выберите заказчика</option>'));

            // Перебираем массив заказчиков и добавляем опции для каждого заказчика
            $.each(customers, function (index, customer) {
                // Предполагаем, что объект customer имеет поля 'id' и 'name' (или как они называются у вас)
                dropdown.append($('<option></option>').attr('value', customer.id).text(customer.fieldValueMap.name));
            });

        }).fail(function () {
            // Обработка ошибки загрузки заказчиков
            alert('Не удалось загрузить список заказчиков. Пожалуйста, обновите страницу.');
            $('#customerDropdown').html('<option value="">Ошибка загрузки заказчиков</option>'); // Сообщаем об ошибке в Dropdown
        });
    }

    // Функция для инициализации DataTables
    function initDataTable(columns, data) {
        dataTable = $('#selectionMatrix').DataTable({
            paging: false, // Отключаем пагинацию
            searching: false, // Отключаем поиск
            columns: columns, // Используем динамически созданные columns
            data: data // Используем динамически созданные data
        });
    }

    function loadDataTable(customerId) {
        if (!customerId) {
            // Очистить таблицу или показать сообщение "Выберите заказчика" (как и раньше)
            if (dataTable) {
                dataTable.clear().draw();
            } else {
                $('#selectionMatrix tbody').html('<tr><td valign="top" colspan="4" class="dataTables_empty">Выберите заказчика для отображения объектов</td></tr>');
            }
            return;
        }
    
        // Объявляем функции для загрузки марок и объектов, возвращающие Promise
        const loadMarksData = () => {
            return new Promise((resolve, reject) => {
                $.getJSON('/get/marks', function (marksData) {
                    marks = marksData; // Сохраняем полный массив данных о марках (глобально, если нужно)
                    resolve(marksData); // Разрешаем Promise и передаем marksData
                }).fail(function(jqXHR, textStatus, errorThrown) {
                    console.error("Ошибка загрузки марок:", textStatus, errorThrown);
                    reject("Ошибка загрузки марок: " + textStatus + " " + errorThrown); // Отклоняем Promise в случае ошибки
                });
            });
        };
    
        const loadObjectsData = () => {
            return new Promise((resolve, reject) => {
                $.getJSON(`/get/objects/${customerId}`, function (objectsData) {
                    objects = objectsData // Сохраняем objects (глобально, если нужно)
                    resolve(objectsData); // Разрешаем Promise и передаем objectsData
                }).fail(function(jqXHR, textStatus, errorThrown) {
                    console.error("Ошибка загрузки объектов:", textStatus, errorThrown);
                    reject("Ошибка загрузки объектов: " + textStatus + " " + errorThrown); // Отклоняем Promise в случае ошибки
                });
            });
        };
    
        Promise.all([loadMarksData(), loadObjectsData()]) // Запускаем оба Promise параллельно
            .then(([marksData, objectsData]) => { // Когда оба Promise выполнены успешно, получаем результаты
    
                // **Теперь у нас есть marksData и objectsData, можно создавать таблицу**
    
                var columns = [{ title: "Объект проектирования" }];
                marksData.forEach(function (mark) {
                    columns.push({ title: mark.fieldValueMap.code });
                });
    
                var tableData = [];
                objectsData.forEach(function (object) {
                    var rowData = [object.fieldValueMap.name];
                    marksData.forEach(function (mark) {
                        rowData.push('<input type="checkbox" data-object-id="' + object.id + '" data-mark-id="' + mark.id + '">');
                    });
                    tableData.push(rowData);
                });
    
                initDataTable(columns, tableData); // Инициализируем DataTables
                console.log("Таблица DataTables успешно инициализирована после загрузки данных."); // Подтверждение в консоли
    
            })
            .catch(error => { // Обрабатываем ошибки, если хотя бы один из Promise будет отклонен
                console.error("Ошибка при загрузке данных для таблицы:", error);
                alert("Ошибка загрузки данных для таблицы. Пожалуйста, попробуйте еще раз.");
                if (dataTable) {
                    dataTable.clear().draw();
                }
                $('#selectionMatrix tbody').html('<tr><td valign="top" colspan="4" class="dataTables_empty">Ошибка загрузки данных. Пожалуйста, обновите страницу.</td></tr>');
            });
    }

    function loadProjectsDropdown() {
        $.getJSON('/get/projects', function (projects) { //  Запрос к новому маршруту /get/projects
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
    
        $.getJSON(`/get/projects/${projectId}`, function (projectData) {
            console.log("Данные проекта получены:", projectData);
            // Получаем строку selection_matrix из projectData
            var selectionMatrixString = projectData.fieldValueMap.selection_matrix;
            // Преобразуем строку selectionMatrixString в JavaScript объект
            var selectionMatrix = JSON.parse(selectionMatrixString);

            // **Добавляем заполнение поля "Название проекта"**
            $('#projectName').val(projectData.fieldValueMap.name); // Используем projectData.fieldValueMap.name

            if (selectionMatrix && selectionMatrix.objects) {
                // Перебираем массив объектов
                selectionMatrix.objects.forEach(function(objectData) {
                    console.log("  Обработка объекта:", objectData.id);
                    
                    // Проверяем наличие массива marks
                    if (Array.isArray(objectData.marks)) {
                        console.log("  Марки для объекта:", objectData.marks);
                        
                        // Перебираем марки объекта
                        objectData.marks.forEach(function(mark) {
                            const lowerObjectId = objectData.id.toLowerCase();
                            const lowerMarkId = mark.id.toLowerCase();
                            
                            var checkbox = $(`#selectionMatrix input[type="checkbox"][data-object-id="${lowerObjectId}"][data-mark-id="${lowerMarkId}"]`);
                            
                            if (checkbox.length) {
                                checkbox.prop('checked', true);
                                console.log(`    Установлен чекбокс для объекта ${objectData.id} и марки ${mark.id}`);
                            } else {
                                console.warn(`    ПРЕДУПРЕЖДЕНИЕ: Чекбокс НЕ НАЙДЕН для objectId: ${objectData.id}, markId: ${mark.id}`);
                            }
                        });
                    } else {
                        console.warn("  ВНИМАНИЕ: marks не является массивом для объекта:", objectData.id);
                    }
                });
            } else {
                console.warn("selectionMatrix отсутствует или не содержит массив objects");
            }
    
        }).fail(function(jqXHR, textStatus, errorThrown) {
            console.error("Ошибка загрузки данных проекта:", textStatus, errorThrown);
            alert("Ошибка загрузки данных проекта. Пожалуйста, попробуйте еще раз.");
        });
    }

    function getSelectionMatrix() {
        var selectionMatrix = { objects: [] };
    
        objects.forEach(function (object) {
            // Сначала проверим, есть ли выбранные марки для этого объекта
            var hasSelectedMarks = marks.some(function (mark) {
                var checkbox = $('input[type="checkbox"][data-object-id="' + object.id + '"][data-mark-id="' + mark.id + '"]');
                return checkbox.is(':checked');
            });
    
            // Если есть хотя бы одна выбранная марка, создаем объект
            if (hasSelectedMarks) {
                var objectEntry = {
                    id: object.id,
                    name: object.fieldValueMap.name,
                    folder_structure_id: "",
                    marks: []
                };
    
                // Добавляем только выбранные марки
                marks.forEach(function (mark) {
                    var checkbox = $('input[type="checkbox"][data-object-id="' + object.id + '"][data-mark-id="' + mark.id + '"]');
                    if (checkbox.is(':checked')) {
                        var markEntry = {
                            id: mark.id,
                            name: mark.fieldValueMap.name,
                            number: "",
                            folder_structure_id: ""
                        };
                        objectEntry.marks.push(markEntry);
                    }
                });
    
                selectionMatrix.objects.push(objectEntry);
            }
        });
    
        return selectionMatrix;
    }

    // Обработчик нажатия кнопки "Сохранить изменения"
    $('#editProjectBtn').click(function () {
        var projectId = $('#projectDropdown').val();
        var projectName = $('#projectName').val();
        var selectionMatrixActual = getSelectionMatrix();


        $.ajax({
            url: '/set/update', // URL для создания проекта на backend
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({projectId: projectId, projectName: projectName, selectionMatrix: selectionMatrixActual}),
            success: function (response) {
                // Очищаем поле ввода названия проекта
                //$('#projectName').val(''); 
                //$('#selectionMatrix input[type="checkbox"]').prop('checked', false);

                // Выводим сообщение об успешном создании проекта
                alert("Проект успешно изменен! ID: " + response);
            },
            error: function (error) {
                alert("Ошибка изменения проекта: " + error.responseJSON.error);
            }
        });
    });

    $('#customerDropdown').change(function() { // Обработчик события change для Dropdown
        var selectedCustomerId = $(this).val(); // Получаем ID выбранного заказчика из value option
        console.log('Выбранный ID заказчика:', selectedCustomerId);
        loadDataTable(selectedCustomerId); // Вызываем функцию загрузки таблицы, передавая ID заказчика
    });

    $('#projectDropdown').change(function() { // Обработчик change для Dropdown проектов
        var selectedProjectId = $(this).val();
        console.log('Выбранный ID проекта:', selectedProjectId);
        loadProjectData(selectedProjectId); // Вызываем функцию загрузки данных проекта при выборе проекта

        // *** Включаем кнопку "Сохранить изменения" после выбора проекта ***
        if (selectedProjectId) { // Проверяем, что заказчик выбран (ID не пустой)
            $('#editProjectBtn').prop('disabled', false); // Включаем кнопку
        } else {
            $('#editProjectBtn').prop('disabled', true);  // Иначе, выключаем кнопку, если заказчик не выбран
        }
    });

    if ($('#customerDropdown').length) { // Проверяем, есть ли элемент с ID customerDropdown на странице (только на edit_project.html)
        loadCustomersDropdown(); // Загружаем Dropdown заказчиков на странице edit_project.html
    }
    // Загружаем Dropdown проектов на странице edit_project.html
    if ($('#projectDropdown').length) { // Проверяем, есть ли элемент с ID projectDropdown на странице (только на edit_project.html)
        loadProjectsDropdown(); // Загружаем Dropdown проектов только на странице редактирования проекта
    }
});