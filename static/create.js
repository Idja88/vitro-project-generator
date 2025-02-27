$(document).ready(function () {
    var marks = []; // Массив для хранения марок комплектов
    var objects = []; // Массив для хранения объектов проектирования
    var dataTable; // Переменная для хранения объекта DataTables

    // *** Код для загрузки и заполнения Dropdown заказчиков ***
    function loadCustomersDropdown() {
        $.getJSON('/data/customers', function (customers) {
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

    // Функция для загрузки данных и заполнения таблицы
    function loadDataTable(customerId) {

        if (!customerId) { // Если customerId не передан или пустой
            // Очистить таблицу или показать сообщение "Выберите заказчика"
            if (dataTable) { // Проверка инициализирована ли таблица
                dataTable.clear().draw(); // Очистить данные таблицы, если она инициализирована
            } else {
                // Если таблица еще не инициализирована, можно показать сообщение в placeholder таблицы (если placeholder есть в HTML)
                $('#selectionMatrix tbody').html('<tr><td valign="top" colspan="4" class="dataTables_empty">Выберите заказчика для отображения объектов</td></tr>');
            }
            return; // Выйти из функции, если заказчик не выбран
        }

        // 1. Получаем марки комплектов
        $.getJSON('/data/marks', function (marksData) {
            marks = marksData; // Сохраняем полный массив данных о марках
            //console.log('marksData:', marksData);
            var columns = [{ title: "Объект проектирования" }]; // Начинаем с первого столбца "Объект проектирования"
            marksData.forEach(function (mark) {
                columns.push({ title: mark.fieldValueMap.code }); // Используем mark.fieldValueMap.code для заголовков
            });
        

            // 2. Получаем объекты проектирования
            $.getJSON(`/data/objects/${customerId}`, function (objectsData) { // Пока получаем объекты проектирования по конкретной константе
                objects = objectsData.map(object => ({ name: object.fieldValueMap.name, id: object.id })); //  Предполагаем, API возвращает {name: "Объект", id: "ID", ...}

                var tableData = [];
                objects.forEach(function (object) {
                    var rowData = [object.name]; // Первый столбец - название объекта
                    marksData.forEach(function (mark) {
                        rowData.push('<input type="checkbox" data-object-id="' + object.id + '" data-mark-id="' + mark.id + '">'); // Чекбоксы
                    });
                    tableData.push(rowData);
                });

            //console.log('columns:', columns);
            initDataTable(columns, tableData); // Инициализируем DataTables ПОСЛЕ получения всех данных и создания columns и data

            }).fail(function(jqXHR, textStatus, errorThrown) {
                console.error("Ошибка загрузки объектов:", textStatus, errorThrown);
                alert("Ошибка загрузки объектов. Пожалуйста, попробуйте еще раз.");
                if (dataTable) { // Проверка инициализирована ли таблица
                    dataTable.clear().draw(); // Очистить данные таблицы, если она инициализирована
                }
                $('#selectionMatrix tbody').html('<tr><td valign="top" colspan="4" class="dataTables_empty">Ошибка загрузки объектов. Пожалуйста, обновите страницу.</td></tr>'); // Сообщение об ошибке в таблицу;
            });
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
            selectionMatrix[object.name] = [];
            marks.forEach(function (mark) {
                var checkbox = $('input[type="checkbox"][data-object-id="' + object.id + '"][data-mark-id="' + mark.id + '"]'); // Используем data-mark-code
                if (checkbox.is(':checked')) {
                    selectionMatrix[object.id].push(mark.id); // Используем mark.fieldValueMap.code для матрицы
                }
            });
        });

        $.ajax({
            url: '/projects/create', // URL для создания проекта на backend
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ projectName: projectName, selectionMatrix: selectionMatrix }),
            success: function (response) {
                // Очищаем поле ввода названия проекта
                $('#projectName').val(''); 
                $('#selectionMatrix input[type="checkbox"]').prop('checked', false);

                alert("Проект успешно создан! ID: " + response);
            },
            error: function (error) {
                alert("Ошибка создания проекта: " + error.responseJSON.error);
            }
        });
    });

    //console.log($('#selectionMatrix').length)
    //loadData();      // Запускаем загрузку данных, инициализация DataTables будет внутри loadData после получения данных
    loadCustomersDropdown(); // Запускаем загрузку заказчиков
});