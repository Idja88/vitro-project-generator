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

    $('#customerDropdown').change(function() { // Обработчик события change для Dropdown
        var selectedCustomerId = $(this).val(); // Получаем ID выбранного заказчика из value option
        console.log('Выбранный ID заказчика:', selectedCustomerId);
        loadDataTable(selectedCustomerId); // Вызываем функцию загрузки таблицы, передавая ID заказчика

        // *** Включаем кнопку "Создать Проект" после выбора заказчика ***
        if (selectedCustomerId) { // Проверяем, что заказчик выбран (ID не пустой)
            $('#createProjectBtn').prop('disabled', false); // Включаем кнопку
        } else {
            $('#createProjectBtn').prop('disabled', true);  // Иначе, выключаем кнопку, если заказчик не выбран
        }
    });

    // Обработчик нажатия кнопки "Создать Проект"
    $('#createProjectBtn').click(function () {
        var projectName = $('#projectName').val();
        var selectionMatrix = {};

        objects.forEach(function (object) {
            selectionMatrix[object.id] = [];
            marks.forEach(function (mark) {
                var checkbox = $('input[type="checkbox"][data-object-id="' + object.id + '"][data-mark-id="' + mark.id + '"]'); // Используем data-mark-code
                if (checkbox.is(':checked')) {
                    selectionMatrix[object.id].push(mark.id); // Используем mark.fieldValueMap.code для матрицы
                }
            });
        });

        $.ajax({
            url: '/set/create', // URL для создания проекта на backend
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ projectName: projectName, selectionMatrix: selectionMatrix }),
            success: function (response) {
                // Очищаем поле ввода названия проекта
                $('#projectName').val(''); 
                //$('#selectionMatrix input[type="checkbox"]').prop('checked', false);
                $('#customerDropdown').val(''); // Сбрасываем выбор заказчика после создания проекта

                alert("Проект успешно создан! ID: " + response);
            },
            error: function (error) {
                alert("Ошибка создания проекта: " + error.responseJSON.error);
            }
        });
    });

    if ($('#customerDropdown').length) { // Проверяем, есть ли элемент с ID customerDropdown на странице (только на edit_project.html)
        loadCustomersDropdown(); // Загружаем Dropdown заказчиков на странице edit_project.html
    }
});