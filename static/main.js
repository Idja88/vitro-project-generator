$(document).ready(function () {
    // 1. Global Variables
    var dataTable;
    var projects = [];
    var objects = [];
    var marks = [];
    var selectedRows = [];
    var selectedColumns = [];
    var savedCheckboxStates = [];

    $.ajaxPrefilter(function(options) {
        if (options.url.startsWith('/') && APP_CONFIG.PREFIX) {
            const originalUrl = options.url;
            options.url = APP_CONFIG.PREFIX + options.url;
        }
    });

    // Функция для безопасного формирования ссылок
    function buildListUrl(listId) {
        if (!APP_CONFIG.VITRO_CAD_API_BASE_URL || !listId) {
            console.warn('Missing configuration for list URL:', {
                baseUrl: APP_CONFIG.VITRO_CAD_API_BASE_URL,
                listId: listId
            });
            return null;
        }
        return `${APP_CONFIG.VITRO_CAD_API_BASE_URL}/list/${listId}`;
    }
    
    // Обновляем ссылки и скрываем кнопки если ссылок нет
    function updateNavigationLinks() {
        // Ссылка для объектов
        var objectListUrl = buildListUrl(APP_CONFIG.OBJECT_LIST_ID);
        if (objectListUrl) {
            $('#goToObjectBtn').attr('href', objectListUrl).show();
        } else {
            $('#goToObjectBtn').hide();
        }
        
        // Ссылка для марок
        var markListUrl = buildListUrl(APP_CONFIG.MARK_LIST_ID);
        if (markListUrl) {
            $('#goToMarkBtn').attr('href', markListUrl).show();
        } else {
            $('#goToMarkBtn').hide();
        }
    }

    // 2. Utility Functions
    function getCheckboxStates() {
        var states = [];
        $('#selectionMatrix tbody tr').each(function(rowIdx) {
            var rowStates = [];
            $(this).find('td input[type="checkbox"]').each(function(colIdx) {
                rowStates.push($(this).prop('checked'));
            });
            states.push(rowStates);
        });
        return states;
    }

    function restoreCheckboxStates(states) {
        $('#selectionMatrix tbody tr').each(function(rowIdx) {
            if (states[rowIdx]) {
                $(this).find('td input[type="checkbox"]').each(function(colIdx) {
                    $(this).prop('checked', states[rowIdx][colIdx]);
                });
            }
        });
    }

    function resetSelections() {
        selectedRows = [];
        selectedColumns = [];
        
        // Используем новые функции для очистки выделений
        updateRowSelection();
        updateColumnSelection();
        
        updateDeleteButtonState();
    }

    function reattachEventHandlers() {
        // Удаляем все существующие обработчики
        $('#selectionMatrix tbody').off('click', '**');
        
        // Для заголовков используем более специфичный селектор или API
        if (dataTable && dataTable.columns) {
            // Удаляем обработчики через API
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            
            // Удаляем все существующие обработчики с заголовков
            api.columns().every(function(index) {
                var $header = $(this.header());
                $header.off('click.columnSelect');
            });
        }

        // Обработчик выделения строк в reattachEventHandlers()
        $('#selectionMatrix tbody').on('click', 'td:not(:first-child)', function(e) {
            // Проверяем, был ли клик на чекбоксе или его контейнере
            if ($(e.target).is('input[type="checkbox"]')) {
                return; // Игнорируем клики на чекбоксы
            }
            
            e.stopPropagation();
            var row = $(this).closest('tr');
            
            // ИСПРАВЛЕНИЕ: Получаем как API индекс, так и DOM позицию
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            var apiRowIdx = api.row(row).index(); // Внутренний индекс данных
            var domRowIdx = row.index(); // Визуальная позиция в DOM
            
            console.log(`Row clicked: API index is ${apiRowIdx}, DOM index is ${domRowIdx}`);
            
            // ИСПРАВЛЕНИЕ: Ищем нужный индекс в selectedRows
            // Проверяем, есть ли в selectedRows индекс, который соответствует текущей DOM позиции
            var targetIndex = -1;
            
            // Сначала пробуем найти по API индексу (если строка не перемещалась)
            if (selectedRows.includes(apiRowIdx)) {
                targetIndex = apiRowIdx;
                console.log(`Found by API index: ${targetIndex}`);
            } else {
                // Если не найден по API индексу, ищем по DOM позиции
                // (это случай когда строка была перемещена)
                if (selectedRows.includes(domRowIdx)) {
                    targetIndex = domRowIdx;
                    console.log(`Found by DOM index: ${targetIndex}`);
                }
            }
            
            // Переключаем выделение строки
            if (targetIndex !== -1) {
                // Снимаем выделение
                selectedRows = selectedRows.filter(idx => idx !== targetIndex);
                row.removeClass('selected');
                row.find('td').removeClass('selected');
                console.log(`Row ${targetIndex} deselected`);
            } else {
                // Добавляем выделение
                // ИСПРАВЛЕНИЕ: Используем DOM индекс для новых выделений после перемещения
                if (!selectedRows.includes(domRowIdx)) {
                    selectedRows.push(domRowIdx);
                }
                row.addClass('selected');
                row.find('td').addClass('selected');
                console.log(`Row ${domRowIdx} selected`);
            }
            
            // ИСПРАВЛЕНИЕ: Удаляем дубликаты после любых изменений
            selectedRows = [...new Set(selectedRows)];
            
            updateDeleteButtonState();
            console.log(`Row selection toggled. Current selected rows:`, selectedRows);
        });

        // Обработчик выделения столбцов через DataTables API
        if (dataTable && dataTable.columns) {
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            
            // Привязываем обработчики к каждому заголовку через API
            api.columns().every(function(index) {
                if (index === 0) return; // Пропускаем первый столбец
                
                var $header = $(this.header());
                
                // Добавляем обработчик с namespace для безопасного удаления
                $header.on('click.columnSelect', function(e) {
                    e.stopPropagation();
                    
                    // Используем индекс из API, а не DOM
                    var colIdx = index;
                    
                    $(this).toggleClass('selected');
                    
                    // Выделение всего столбца через API
                    api.column(colIdx).nodes().each(function(cell) {
                        $(cell).toggleClass('column-selected');
                    });
                    
                    if ($(this).hasClass('selected')) {
                        if (!selectedColumns.includes(colIdx)) {
                            selectedColumns.push(colIdx);
                        }
                    } else {
                        selectedColumns = selectedColumns.filter(idx => idx !== colIdx);
                    }
                    
                    updateDeleteButtonState();
                    
                    console.log("Selected columns:", selectedColumns);
                });
            });
        }

        // Функция для подсветки строки и столбца
        function highlightCrossHairs(targetCell) {
            if (!targetCell || !targetCell.length) return;
            
            var $table = $('#selectionMatrix');
            var cellIndex = targetCell.index();
            var api = dataTable.api ? dataTable : $table.DataTable();
            
            // Убираем предыдущие подсветки
            clearCrossHairs();
            
            // Подсвечиваем всю строку (включая первую ячейку)
            targetCell.closest('tr').find('td').addClass('row-highlight');
            
            // Подсвечиваем весь столбец через DataTables API
            if (cellIndex > 0) { // Только если это не первый столбец
                // Получаем заголовок через API
                var $header = $(api.column(cellIndex).header());
                $header.addClass('column-highlight');
                
                // Подсвечиваем все ячейки столбца
                api.column(cellIndex).nodes().each(function(cell) {
                    $(cell).addClass('column-highlight');
                });
            }
            
            // Подсвечиваем текущую ячейку
            targetCell.addClass('cell-highlight');
        }

        // Функция для подсветки только столбца (для заголовков)
        function highlightColumn(columnIndex) {
            if (columnIndex <= 0) return; // Не подсвечиваем первый столбец
            
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            
            // Убираем предыдущие подсветки
            clearCrossHairs();
            
            // Подсвечиваем заголовок через API
            var $header = $(api.column(columnIndex).header());
            $header.addClass('column-highlight cell-highlight');
            
            // Подсвечиваем весь столбец
            api.column(columnIndex).nodes().each(function(cell) {
                $(cell).addClass('column-highlight');
            });
        }

        // Функция для удаления подсветки
        function clearCrossHairs() {
            var $table = $('#selectionMatrix');
            
            // Убираем классы со всех элементов таблицы
            $table.find('td, th').removeClass('row-highlight column-highlight cell-highlight');
            
            // Дополнительная очистка через API если доступно
            if (typeof dataTable !== 'undefined' && dataTable) {
                try {
                    var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
                    api.columns().every(function() {
                        $(this.header()).removeClass('row-highlight column-highlight cell-highlight');
                    });
                } catch (e) {
                    // Игнорируем ошибки API если таблица не инициализирована
                }
            }
        }

        // Обработчики только для ячеек с чекбоксами (исключаем первый столбец)
        $('#selectionMatrix tbody').on('mouseenter', 'td:not(:first-child)', function(e) {
            // Проверяем, есть ли в ячейке чекбокс
            if ($(this).find('input[type="checkbox"]').length > 0) {
                highlightCrossHairs($(this));
            }
        });

        // Обработчик для первого столбца - убираем подсветку
        $('#selectionMatrix tbody').on('mouseenter', 'td:first-child', function(e) {
            clearCrossHairs();
        });

        // Обработчики для заголовков столбцов (исключаем первый заголовок)
        $('#selectionMatrix thead').on('mouseenter', 'th:not(:first-child)', function(e) {
            var columnIndex = $(this).index();
            highlightColumn(columnIndex);
        });

        // Обработчик для первого заголовка - убираем подсветку
        $('#selectionMatrix thead').on('mouseenter', 'th:first-child', function(e) {
            clearCrossHairs();
        });

        // Очистка при уходе мыши с таблицы
        $('#selectionMatrix').on('mouseleave', function() {
            clearCrossHairs();
        });

        // Очистка при переходе между элементами внутри таблицы
        $('#selectionMatrix').on('mouseenter', 'td, th', function(e) {
            // Если это первый столбец или заголовок - очищаем
            if ($(this).is('td:first-child, th:first-child')) {
                clearCrossHairs();
                return;
            }
            
            // Если это обычная ячейка без чекбокса - очищаем
            if ($(this).is('td') && !$(this).find('input[type="checkbox"]').length) {
                clearCrossHairs();
                return;
            }
        });

        // Дополнительная очистка при клике
        $('#selectionMatrix').on('click', function() {
            setTimeout(clearCrossHairs, 20);
        });
    }

    function updateDeleteButtonState() {
        var hasSelection = selectedRows.length > 0 || selectedColumns.length > 0;
        $('#deleteButton').prop('disabled', !hasSelection);
    }

    function getSelectionMatrix(projectId, projectName, projectMatrix) {
        // Parse the original matrix with proper error handling
        var originalMatrix;

        if (!projectMatrix) {
            // For a new project, initialize with empty structure
            originalMatrix = { folder_structure_id: "", objects: [] };
        } else {
            try {
                originalMatrix = typeof projectMatrix === 'string' ? JSON.parse(projectMatrix) : projectMatrix;
            } catch (e) {
                originalMatrix = { folder_structure_id: "", objects: [] };
            }
        }

        console.log("Original Matrix:", originalMatrix);

        var selectionMatrix = { 
            id: projectId,
            name: projectName,
            folder_structure_id: originalMatrix.folder_structure_id || "",
            objects: []
        };

        // Создаем Map для отслеживания выбранных объектов и марок
        var processedObjects = new Map();
        
        // ЭТАП 1: Обрабатываем все отмеченные чекбоксы
        $('#selectionMatrix input[type="checkbox"]:checked').each(function() {
            var $checkbox = $(this);
            var $row = $checkbox.closest('tr');
            var $col = $checkbox.closest('td');
            
            // Get object info from the first cell
            var $objectDiv = $row.find('td:first-child div');
            var objectId = $objectDiv.data('object-id');
            var objectName = $objectDiv.data('object-name');
            var objectNumber = $objectDiv.data('object-number');
        
            // Get mark info from the column header using DataTables API
            var colIndex = $col.index();
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            var $markHeader = $(api.column(colIndex).header()).find('div');
            
            // Проверяем, что заголовок найден и имеет данные
            if (!$markHeader.length || !$markHeader.data('mark-id')) {
                console.warn(`No valid mark header found for column ${colIndex}`);
                return; // Пропускаем эту итерацию
            }
            
            var markId = $markHeader.data('mark-id');
            var markName = $markHeader.data('mark-name');
            var markNumber = $markHeader.data('mark-number') || '';
        
            // Check if this object was previously deleted
            var wasObjectDeleted = false;
            var folderStructureId = "";
            var originalObj = originalMatrix.objects.find(obj => obj.id === objectId);
            
            if (originalObj) {
                folderStructureId = originalObj.folder_structure_id || "";
                wasObjectDeleted = originalObj.deleted === true;
            }
            
            // Create or update object entry
            if (!processedObjects.has(objectId)) {
                processedObjects.set(objectId, {
                    id: objectId,
                    name: objectName,
                    number: objectNumber,
                    folder_structure_id: folderStructureId,
                    to_remove: false,
                    deleted: wasObjectDeleted,
                    // Если объект ранее был удален И сейчас выбран заново, помечаем для восстановления
                    to_restore: wasObjectDeleted,
                    marks: [],
                    // Дополнительное поле для отслеживания, что объект был явно выбран
                    explicitly_selected: true
                });
            }

            // Add mark to object
            var objectEntry = processedObjects.get(objectId);

            // Check if this mark was previously deleted
            var markFolderStructureId = "";
            var wasMarkDeleted = false;

            if (originalObj && originalObj.marks) {
                var originalMark = originalObj.marks.find(mark => 
                    mark.id === markId && 
                    (mark.number || "") === (markNumber || "")
                );
                if (originalMark) {
                    markFolderStructureId = originalMark.folder_structure_id || "";
                    wasMarkDeleted = originalMark.deleted === true;
                }
            }

            // Проверяем, есть ли уже эта марка в объекте
            var existingMarkIndex = objectEntry.marks.findIndex(mark => 
                mark.id === markId && mark.number === (markNumber || "")
            );

            if (existingMarkIndex === -1) {
                // Добавляем новую марку
                objectEntry.marks.push({
                    id: markId,
                    name: markName,
                    number: markNumber || "",
                    folder_structure_id: markFolderStructureId,
                    to_remove: false,
                    deleted: wasMarkDeleted,
                    // Если марка ранее была удалена И сейчас выбрана, помечаем для восстановления
                    to_restore: wasMarkDeleted,
                    // Дополнительное поле для отслеживания, что марка была явно выбрана
                    explicitly_selected: true
                });
            } else {
                // Обновляем существующую марку, помечая как явно выбранную
                objectEntry.marks[existingMarkIndex].to_restore = wasMarkDeleted;
                objectEntry.marks[existingMarkIndex].explicitly_selected = true;
            }
        });
        
        // ЭТАП 2: Объединяем данные из текущего выбора с данными из оригинальной матрицы
        
        // Начинаем с создания массива из Map
        var selectedObjects = Array.from(processedObjects.values());
        
        // Копируем все объекты из оригинальной матрицы
        if (originalMatrix && originalMatrix.objects && originalMatrix.objects.length > 0) {
            originalMatrix.objects.forEach(originalObj => {
                // Ищем объект в списке выбранных
                var foundObject = selectedObjects.find(obj => obj.id === originalObj.id);
                
                if (foundObject) {
                    // Объект был выбран явно, обработаем все его марки из оригинальной матрицы
                    if (originalObj.marks && originalObj.marks.length > 0) {
                        originalObj.marks.forEach(originalMark => {
                            // Ищем марку среди явно выбранных
                            var foundMark = foundObject.marks.find(mark => 
                                mark.id === originalMark.id && mark.number === (originalMark.number || "")
                            );
                            
                            if (!foundMark) {
                                // Если марка не была явно выбрана, добавляем её с оригинальными свойствами
                                // Если она была удалена, сохраняем это состояние
                                // Если не была удалена, помечаем для удаления (to_remove: true)
                                foundObject.marks.push({
                                    ...originalMark,
                                    to_remove: !originalMark.deleted,
                                    to_restore: false  // только явно выбранные марки помечаются для восстановления
                                });
                            }
                        });
                    }
                } else {
                    // Объект не был явно выбран, добавляем его полностью из оригинальной матрицы
                    var objectCopy = { 
                        ...originalObj, 
                        // Если объект был удален, сохраняем это состояние,
                        // иначе помечаем для удаления (to_remove: true)
                        to_remove: !originalObj.deleted,
                        to_restore: false, // только явно выбранные объекты помечаются для восстановления
                        explicitly_selected: false
                    };
                    
                    // Обрабатываем марки
                    if (originalObj.marks && originalObj.marks.length > 0) {
                        objectCopy.marks = originalObj.marks.map(originalMark => ({
                            ...originalMark,
                            // Если марка была удалена, сохраняем это состояние,
                            // иначе помечаем для удаления (to_remove: true)
                            to_remove: !originalMark.deleted,
                            to_restore: false,  // только явно выбранные марки помечаются для восстановления
                            explicitly_selected: false
                        }));
                    }
                    
                    selectedObjects.push(objectCopy);
                }
            });
        }
        
        // ЭТАП 3: Очистка служебных полей перед отправкой на сервер
        selectionMatrix.objects = selectedObjects.map(obj => {
            // Удаляем служебное поле explicitly_selected
            const { explicitly_selected, ...objectWithoutExplicitlySelected } = obj;
            
            // Очищаем поле explicitly_selected из всех марок
            if (obj.marks && obj.marks.length > 0) {
                objectWithoutExplicitlySelected.marks = obj.marks.map(mark => {
                    const { explicitly_selected, ...markWithoutExplicitlySelected } = mark;
                    return markWithoutExplicitlySelected;
                });
            }
            
            return objectWithoutExplicitlySelected;
        });
        
        console.log("Selection Matrix:", selectionMatrix);
        return selectionMatrix;
    }

    // Add utility function for alerts at the top of the file
    // Обновленная функция showAlert для поддержки кнопки "Перейти"
    function showAlert(message, type, linkUrl) {
        // Get modal elements
        const modal = $('#alertModal');
        const header = modal.find('.modal-header');
        const title = modal.find('.modal-title');
        const goToBtn = $('#goToProjectBtn');
        
        // Reset classes
        header.removeClass('bg-success bg-danger bg-warning');
        
        // Set type-specific styles
        switch(type) {
            case 'success':
                header.addClass('bg-success text-white');
                title.text('Успех');
                break;
            case 'danger':
                header.addClass('bg-danger text-white');
                title.text('Ошибка');
                break;
            case 'warning':
                header.addClass('bg-warning');
                title.text('Предупреждение');
                break;
            default:
                title.text('Уведомление');
        }
        
        // Set message
        $('#alertMessage').text(message);
        
        // Handle link button visibility and URL
        if (linkUrl) {
            goToBtn.removeClass('d-none').attr('href', linkUrl);

            // Add click handler that closes the modal when the button is clicked
            goToBtn.off('click').on('click', function() {
                modal.modal('hide');
            });
        } else {
            goToBtn.addClass('d-none').attr('href', '#');
        }
        
        // Show modal
        modal.modal('show');
    }

    // 3. API Functions

    // Load project info by ID
    function loadProjectInfo(projectId) {
        return new Promise((resolve, reject) => {
            $.getJSON(`/get/projects/${projectId}`, function (project) {
                $('#projectName').val(`${project.fieldValueMap.name}`);
                $('#projectCode').val(`${project.fieldValueMap.project_code_auto}`);
                $('#projectChief').val(`${project.fieldValueMap.chief_project_engineer.fieldValueMap.name}`);
                projects = project; // Сохраняем для дальнейшего использования
                resolve(project);
            }).fail(function (jqXHR, textStatus, errorThrown) {
                console.error("Ошибка загрузки информации о проекте:", textStatus, errorThrown);
                reject(errorThrown);
            });
        });
    }

    // Load customers
    function loadCustomersDropdown(companyId) {
        return new Promise((resolve, reject) => {
            $.getJSON(`/get/customers/${companyId}`, function (customers) {
                resolve(customers);
            }).fail(function (jqXHR, textStatus, errorThrown) {
                console.error("Ошибка загрузки заказчиков:", textStatus, errorThrown);
                reject(errorThrown);
            });
        });
    }

    // Load objects by customer ID
    function loadObjectsDropdown(customerId) {
        return new Promise((resolve, reject) => {
            $.getJSON(`/get/objects/${customerId}`, function (objectsData) {
                var dropdown = $('#objectDropdown');
                dropdown.empty();

                // Сортируем объекты по имени перед сохранением и добавлением в dropdown
                objectsData.sort(function(a, b) {
                    var nameA = a.fieldValueMap.name.toLowerCase();
                    var nameB = b.fieldValueMap.name.toLowerCase();
                    return nameA.localeCompare(nameB, "ru", {numeric: true, sensitivity: 'base', ignorePunctuation: true});
                });
                    
                objects = objectsData; // Сохраняем для дальнейшего использования

                // Add "Общий объект" as first option
                dropdown.append($('<option></option>')
                .attr('value', '00000000-0000-0000-0000-000000000000')
                .text('Общий объект'));
                
                $.each(objectsData, function (index, object) {
                    dropdown.append($('<option></option>')
                        .attr('value', object.id)
                        .attr('object-number', object.fieldValueMap.object_plan_number)
                        .text(object.fieldValueMap.name));
                });
                resolve(objectsData);
            }).fail(function(jqXHR, textStatus, errorThrown) {
                console.error("Ошибка загрузки объектов:", textStatus, errorThrown);
                $('#objectDropdown').html('<option value="">Ошибка загрузки</option>');
                reject(errorThrown);
            });
        });
    }

    // Load marks
    function loadMarksDropdown() {
        return new Promise((resolve, reject) => {
            $.getJSON('/get/marks', function (marksData) {
                var dropdown = $('#markDropdown');
                dropdown.empty();

                // Сортируем объекты по имени перед сохранением и добавлением в dropdown
                marksData.sort(function(a, b) {
                    var nameA = a.fieldValueMap.name.toLowerCase();
                    var nameB = b.fieldValueMap.name.toLowerCase();
                    return nameA.localeCompare(nameB, "ru", {numeric: true, sensitivity: 'base', ignorePunctuation: true});
                });
                
                marks = marksData; // Сохраняем для дальнейшего использования
                
                $.each(marksData, function (index, mark) {
                    dropdown.append($('<option></option>')
                        .attr('value', mark.id)
                        .text(mark.fieldValueMap.code));
                });
                resolve(marksData);
            }).fail(function(jqXHR, textStatus, errorThrown) {
                console.error("Ошибка загрузки марок:", textStatus, errorThrown);
                $('#markDropdown').html('<option value="">Ошибка загрузки</option>');
                reject(errorThrown);
            });
        });
    }

    //Create project structure
    function createProjectStructure(projectId, SelectionMatrix) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `/set/create/${projectId}`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(SelectionMatrix),
                success: function(response) {
                    console.log('Структура проекта успешно создана:', response);
                    resolve(response);
                },
                error: function(xhr, status, error) {
                    console.error('Ошибка при создании структуры проекта:', xhr.responseJSON || error);
                    reject({
                        stage: 'create',
                        status: status,
                        message: xhr.responseJSON?.error || 'Ошибка создания структуры проекта',
                        details: xhr.responseText
                    });
                }
            });
        });
    }

    // Update project info
    function updateProjectStructure(projectId, selectionMatrix) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `/set/update/${projectId}`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(selectionMatrix),
                success: function(response) {
                    console.log('Структура проекта успешно обновлена:', response);
                    resolve(response);
                },
                error: function(xhr, status, error) {
                    console.error('Ошибка при обновлении структуры проекта:', xhr.responseJSON || error);
                    reject({
                        stage: 'update',
                        status: status,
                        message: xhr.responseJSON?.error || 'Ошибка обновления структуры проекта',
                        details: xhr.responseText
                    });
                }
            });
        });
    }

    function exportToExcelViaAPI(projectId) {        
        // Показываем индикатор загрузки
        const exportBtn = $('#exportExcelButton');
        const originalHtml = exportBtn.html();
        exportBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Экспорт...');
        
        // Формируем URL для скачивания
        let exportUrl = `/export/excel/${projectId}`;

        // Добавляем префикс если он есть
        if (APP_CONFIG.PREFIX) {
            exportUrl = APP_CONFIG.PREFIX + exportUrl;
        }
        
        // Создаем скрытую ссылку для скачивания
        const downloadLink = document.createElement('a');
        downloadLink.href = exportUrl;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        
        // Инициируем скачивание
        downloadLink.click();
        
        // Удаляем ссылку
        document.body.removeChild(downloadLink);
        
        // Восстанавливаем кнопку через небольшую задержку
        setTimeout(() => {
            exportBtn.prop('disabled', false).html(originalHtml);
            //showAlert('Excel файл загружается...', 'success');
        }, 500);
    }

    // 4. Initialization
    // Helper function for empty table initialization
    function initializeEmptyTable() {
        dataTable = $('#selectionMatrix').DataTable({
            ordering: false,
            dom: '<"row"<"col-sm-12"tr>>',
            language: {
                emptyTable: "Нет данных в таблице"
            },
            columns: [{
                title: 'Объект проектирования',
                className: 'dt-center select-cell'
            }],
            columnDefs: [
                {
                    targets: 0,
                    width: "100%",
                }
            ],
            colReorder: {
                columns: ':gt(0)',
                headerRows: [0]
            },
            rowReorder: {
                enable: true,
                selector: 'td.select-cell',
                update: false,
                snapX: true,
                dataSrc: function(row) {
                    return $(row).index();
                }
            },
            select: false,
            scrollY: 'calc(100vh - 200px)',
            scrollCollapse: true,
            paging: false,
            drawCallback: function() {
                reattachEventHandlers();
            }
        });
    }

    function initializeTable(selectionMatrix) {
        // Destroy existing table if it exists
        if ($.fn.DataTable.isDataTable('#selectionMatrix')) {
            dataTable.destroy();
            $('#selectionMatrix').empty();
        }
        
        // Check if we have a saved selection matrix
        if (selectionMatrix) {
            try {
                // Parse the selection matrix if it's a string
                if (typeof selectionMatrix === 'string') {
                    selectionMatrix = JSON.parse(selectionMatrix);
                }

                // Filter out deleted objects
                const activeObjects = selectionMatrix.objects.filter(obj => obj.deleted !== true);
                
                // Prepare columns for DataTable
                let columns = [{
                    title: 'Объект проектирования',
                    className: 'dt-center select-cell'
                }];
                
                // Map to track mark columns by ID
                const markColumnsMap = new Map();
                
                // Process all active objects and their non-deleted marks to build unique mark columns
                activeObjects.forEach(obj => {
                    // Filter out deleted marks within this object
                    const activeMarks = obj.marks.filter(mark => mark.deleted !== true);
                    
                    activeMarks.forEach(mark => {
                        const markKey = `${mark.id}_${mark.number || ''}`;
                        if (!markColumnsMap.has(markKey)) {
                            markColumnsMap.set(markKey, {
                                id: mark.id,
                                name: mark.name,
                                number: mark.number || ''
                            });
                        }
                    });
                });
                
                // Add mark columns
                markColumnsMap.forEach(mark => {
                    columns.push({
                        title: `<div data-mark-id="${mark.id}" data-mark-name="${mark.name}" data-mark-number="${mark.number}">${mark.name}${mark.number}</div>`,
                        className: 'dt-center',
                        defaultContent: '<div class="checkbox-container"><input type="checkbox" class="form-check-input"></div>'
                    });
                });
                
                // Prepare rows and track checkbox selections
                let tableData = [];
                let checkboxSelections = [];
                
                // Convert from column-based marks to row-based objects with columns for each mark
                activeObjects.forEach(obj => {
                    // Create a row for each object
                    let row = [
                        `<div data-object-id="${obj.id}" data-object-name="${obj.name}" data-object-number="${obj.number}">${obj.name}</div>`
                    ];
                    
                    // Pre-fill the row with empty checkboxes
                    for (let i = 0; i < markColumnsMap.size; i++) {
                        row.push('<div class="checkbox-container"><input type="checkbox" class="form-check-input"></div>');
                    }
                    
                    tableData.push(row);
                    
                    // Track which checkboxes should be checked
                    let rowSelections = Array(markColumnsMap.size).fill(false);
                    
                    // Mark checkboxes for associated marks that aren't deleted
                    const activeMarks = obj.marks.filter(mark => mark.deleted !== true);
                    activeMarks.forEach(mark => {
                        const markKey = `${mark.id}_${mark.number || ''}`;
                        // Find the column index for this mark
                        let colIndex = -1;
                        let i = 0;
                        markColumnsMap.forEach((value, key) => {
                            if (key === markKey) colIndex = i;
                            i++;
                        });
                        
                        if (colIndex !== -1) {
                            rowSelections[colIndex] = true;
                        }
                    });
                    
                    checkboxSelections.push(rowSelections);
                });
                
                // Initialize DataTable with prepared data
                dataTable = $('#selectionMatrix').DataTable({
                    ordering: false,
                    dom: '<"row"<"col-sm-12"tr>>',
                    language: {
                        emptyTable: "Нет данных в таблице"
                    },
                    data: tableData,
                    columns: columns,
                    columnDefs: [
                        {
                            targets: 0, 
                            width: "100%",
                        }
                    ],
                    colReorder: {
                        enable: true,
                        columns: ':gt(0)',
                        headerRows: [0],
                    },
                    rowReorder: {
                        enable: true,
                        selector: 'td.select-cell',
                        update: false,
                        snapX: true,
                        dataSrc: function(row) {
                            return $(row).index();
                        }
                    },
                    select: false,
                    scrollY: 'calc(100vh - 200px)',
                    scrollCollapse: true,
                    paging: false,
                    drawCallback: function() {
                        // After table is drawn, check the appropriate checkboxes
                        tableData.forEach((row, rowIdx) => {
                            $('#selectionMatrix tbody tr').eq(rowIdx).find('td:not(:first-child)').each((colIdx, cell) => {
                                if (checkboxSelections[rowIdx] && checkboxSelections[rowIdx][colIdx]) {
                                    $(cell).find('input[type="checkbox"]').prop('checked', true);
                                }
                            });
                        });
                        
                        // Reattach event handlers
                        reattachEventHandlers();
                    }
                });
            } catch (e) {
                console.error("Error rebuilding table from selection matrix:", e);
                // Fall back to empty table initialization
                initializeEmptyTable();
            }
        } else {
            // Initialize empty table if no selection matrix exists
            initializeEmptyTable();
        }
        
        // Reset global variables
        selectedRows = [];
        selectedColumns = [];
        
        attachTableEventHandlers();

        // Reset button states
        updateDeleteButtonState();
    }

    function reinitializeTable(currentData, currentColumns, checkboxStates) {
        // Destroy and clear existing table
        if ($.fn.DataTable.isDataTable('#selectionMatrix')) {
            dataTable.destroy();
            $('#selectionMatrix').empty();
        }
        
        // Rebuild table structure
        var tableHtml = '<thead><tr>';
        currentColumns.forEach(function(col) {
            tableHtml += `<th>${col.title}</th>`;
        });
        tableHtml += '</tr></thead><tbody></tbody>';
        $('#selectionMatrix').html(tableHtml);
        
        // Initialize new table
        dataTable = $('#selectionMatrix').DataTable({
            ordering: false,
            dom: '<"row"<"col-sm-12"tr>>',
            data: currentData,
            columns: currentColumns,
            columnDefs: [
                {
                    targets: 0, 
                    width: "100%",
                }
            ],
            language: {
                emptyTable: "Нет данных в таблице"
            },
            colReorder: {
                enable: true,
                columns: ':gt(0)',
                headerRows: [0],
            },
            rowReorder: {
                enable: true,
                selector: 'td.select-cell',
                update: false,
                snapX: true,
                dataSrc: function(row) {
                    return $(row).index();
                }
            },
            select: false,
            scrollY: 'calc(100vh - 200px)',
            scrollCollapse: true,
            paging: false,
            drawCallback: function(settings) {
                var api = this.api();
                
                // Ensure checkboxes exist in all cells first
                api.columns().every(function(index) {
                    if (index > 0) {
                        var column = this;
                        column.nodes().each(function(cell) {
                            if (!$(cell).find('input[type="checkbox"]').length) {
                                $(cell).html('<div class="checkbox-container"><input type="checkbox" class="form-check-input"></div>');
                            }
                        });
                    }
                });

                // Then restore states and handlers
                reattachEventHandlers();
                if (checkboxStates) {
                    restoreCheckboxStates(checkboxStates);
                }

                // Finally restore column selections if any
                if (selectedColumns && selectedColumns.length > 0) {
                    setTimeout(() => {
                        selectedColumns.forEach(function(colIdx) {
                            if (colIdx < api.columns().nodes().length) {
                                var header = $(api.column(colIdx).header());
                                if (header.length) {
                                    header.addClass('selected');
                                    api.column(colIdx).nodes().each(function(cell) {
                                        $(cell).addClass('column-selected');
                                    });
                                }
                            }
                        });
                    }, 0);
                }
            }
        });

        // Reset global variables
        selectedRows = [];
        selectedColumns = [];
        
        attachTableEventHandlers();

        // Reset button states
        updateDeleteButtonState();
        // Return the new DataTable instance
        return dataTable;
    }

    // 4. Initialization of table data and project info
    if (APP_CONFIG.PROJECT_ID) {
        loadProjectInfo(APP_CONFIG.PROJECT_ID)
            .then(project => {
                // Check if project was already generated
                if (project.fieldValueMap.is_created_by_generator === true) {
                    $('#createProjectBtn').text('Обновить').prop('disabled', false);
                    $('#confirmCreateProject').text('Обновить');
                    initializeEmptyTable();
                    initializeTable(project.fieldValueMap.selection_matrix);
                    updateNavigationLinks();
                }

                // If not genereated, initialize empty table
                if (project.fieldValueMap.is_created_by_generator === false) {
                    $('#createProjectBtn').text('Создать').prop('disabled', false);
                    initializeEmptyTable();
                    updateNavigationLinks();
                }
            })
            .catch(error => {
                showAlert("Не удалось загрузить информацию о проекте", "danger");
            });
    }

    // 5. Event Handlers
    // 5.1 Modal Open Handlers
    $('#newRowButton').on('click', function() {
        // Сначала открываем модальное окно
        $('#addRowModal').modal({
            backdrop: 'static',
            keyboard: false,
            show: true
        });
        
        // Затем проверяем и загружаем данные если нужно
        if ($('#objectDropdown option').length <= 1) {
            loadCustomersDropdown(projects.fieldValueMap.project_company_id)
                .then((customers) => {
                    var selectedCustomerId = customers[0].id;

                    if (selectedCustomerId) {
                        loadObjectsDropdown(selectedCustomerId)
                            .then(() => {
                                // Enable all related controls
                                $('#objectDropdown').prop('disabled', false);
                                $('#addRowConfirm').prop('disabled', false);
                                $('#newRowButton').prop('disabled', false);
                            })
                            .catch(error => {
                                console.error('Ошибка при загрузке объектов:', error);
                                // Disable all related controls
                                $('#objectDropdown').prop('disabled', true);
                                $('#addRowConfirm').prop('disabled', true);
                                $('#newRowButton').prop('disabled', true);
                            });
                    }
                })
                .catch(() => {
                    console.error('Ошибка при загрузке заказчика:', error);
                });
        }
    });

    $('#newColumnButton').on('click', function() {
        // Сначала открываем модальное окно
        $('#addColumnModal').modal({
            backdrop: 'static',
            keyboard: false,
            show: true
        });

        // Load marks if not loaded
        if ($('#markDropdown option').length <= 1) {
            loadMarksDropdown()
                .then(() => {
                    $('#markDropdown').prop('disabled', false);
                })
                .catch(() => {
                    $('#markDropdown').prop('disabled', true);
                });
        }
    });

    // 5.3 Modal Confirmation Handlers
    $('#addRowConfirm').on('click', function() {
        var selectedObjectOptions = $('#objectDropdown option:selected');
        if (selectedObjectOptions.length > 0) {
            var checkboxStates = getCheckboxStates();
            var currentData = dataTable.data().toArray();
            
            var currentColumns = dataTable.settings()[0].aoColumns.map(function(col) {
                return {
                    title: col.sTitle,
                    className: col.sClass,
                    width: col.sWidth
                };
            });
            
            var duplicatesFound = false;

            selectedObjectOptions.each(function() {
                var objectId = $(this).val();
                var objectName = $(this).text();
                var objectNumber = $(this).attr('object-number') || '';
                
                // Check for duplicates
                var isDuplicate = currentData.some(function(row) {
                    var cellDiv = $(row[0]);
                    return cellDiv.data('object-id') === objectId || 
                           cellDiv.text() === objectName;
                });

                if (isDuplicate) {
                    duplicatesFound = true;
                    showAlert(`Объект "${objectName}" уже добавлен в таблицу`, 'warning');
                    return false; // Break the each loop
                }

                var rowData = Array(currentColumns.length).fill('');
                rowData[0] = `<div data-object-id="${objectId}" data-object-name="${objectName}" data-object-number="${objectNumber}">${objectName}</div>`;
                currentData.push(rowData);
            });

            if (!duplicatesFound) {
                dataTable = reinitializeTable(currentData, currentColumns, checkboxStates);
                $('#addRowModal').modal('hide');
            }
        }
    });

    // Обновленная функция проверки валидности
    function updateAddColumnButtonState() {
        // Проверяем, что dropdown имеет опции и что-то выбрано
        var markSelected = $('#markDropdown').val() !== null && 
                          $('#markDropdown').val() !== '' && 
                          $('#markDropdown option').length > 0;
        
        var numberValue = $('#markNumberDropdown').val().trim();
        var numberValid = true;
        
        // Проверяем валидность номера если он введен
        if (numberValue !== '') {
            // Строгая проверка: только цифры от 1 до 99, без ведущих нулей, без спецсимволов
            var num = parseInt(numberValue);
            numberValid = /^[1-9]\d*$/.test(numberValue) && 
                         !isNaN(num) && 
                         num >= 1 && 
                         num <= 99 &&
                         numberValue === num.toString(); // Проверка, что строка соответствует числу
        }
        
        // Кнопка активна только если выбрана марка И номер валиден (или пуст)
        var formValid = markSelected && numberValid;
        $('#addColumnConfirm').prop('disabled', !formValid);
        
        console.log(`Form validation: markSelected=${markSelected}, numberValid=${numberValid}, formValid=${formValid}`);
    }

    // Добавьте обработчик изменения dropdown марок
    $('#markDropdown').on('change', function() {
        updateAddColumnButtonState();
    });

    // Также обновите валидацию input номера раздела
    $('#markNumberDropdown').on('input keyup paste', function() {
        var value = $(this).val().trim();
        
        // Удаляем предыдущие классы валидации
        $(this).removeClass('is-valid is-invalid');

        if (value === '') {
            // Пустое значение допустимо
        } else if (!/^[1-9]\d*$/.test(value) || parseInt(value) > 99) {
            // Строгое регулярное выражение: ТОЛЬКО цифры от 1-9 в начале, затем только цифры
            // Плюс проверка на максимум 99
            $(this).addClass('is-invalid');
        }

        // Обновляем состояние кнопки
        updateAddColumnButtonState();
    });

    // Обновите сброс значений при закрытии модала
    $('#addColumnModal').on('hidden.bs.modal', function () {
        // Сбрасываем input номера раздела
        $('#markNumberDropdown').val('');
        
        // Убираем классы валидации
        $('#markNumberDropdown').removeClass('is-valid is-invalid');
        
    });
    
    // Также добавьте обработчик при открытии модала
    $('#addColumnModal').on('show.bs.modal', function () {
        // Принудительно делаем кнопку неактивной при открытии
        $('#addColumnConfirm').prop('disabled', true);
        
        // Проверяем состояние после небольшой задержки (когда модал полностью открыт)
        setTimeout(function() {
            updateAddColumnButtonState();
        }, 20);
    });

    $('#addColumnConfirm').on('click', function() {
        var selectedMarkOptions = $('#markDropdown option:selected');
        var markNumbers = $('#markNumberDropdown').val();

        if (selectedMarkOptions.length > 0) {        
            var checkboxStates = getCheckboxStates();
            var currentData = dataTable.data().toArray();
            var duplicatesFound = false;
            
            // Получаем все текущие заголовки с их markId и markNumber используя DataTables API
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            var existingHeaders = [];
            
            // Сначала собираем все существующие заголовки
            api.columns().every(function(index) {
                if (index === 0) return; // Пропускаем первый столбец
                
                var $header = $(this.header());
                var $div = $header.find('div');
                
                if ($div.length) {
                    existingHeaders.push({
                        markId: $div.data('mark-id'),
                        markNumber: String($div.data('mark-number') || ''), // Приводим к строке
                        columnIndex: index
                    });
                }
            });

            console.log("Existing headers:", existingHeaders);
            
            // Проверяем каждую выбранную марку на дубликаты
            selectedMarkOptions.each(function() {
                if (duplicatesFound) return false; // Прерываем если уже найден дубликат
                
                var markId = $(this).val();
                var markName = $(this).text();
                var markNumber = String(markNumbers.length > 0 ? (markNumbers || '') : ''); // Приводим к строке
                
                console.log(`Checking mark: markId=${markId}, markName=${markName}, markNumber="${markNumber}"`);
                
                // Ищем дубликат среди существующих заголовков
                var duplicate = existingHeaders.find(function(header) {
                    var sameId = header.markId === markId;
                    var sameNumber = header.markNumber === markNumber;
                    
                    console.log(`Comparing with existing: headerMarkId=${header.markId}, headerNumber="${header.markNumber}"`);
                    console.log(`sameId=${sameId}, sameNumber=${sameNumber}`);
                    
                    return sameId && sameNumber;
                });

                if (duplicate) {
                    duplicatesFound = true;
                    var message = markNumber ? 
                        `Марка "${markName}" с номером раздела "${markNumber}" уже существует в таблице` :
                        `Марка "${markName}" без номера раздела уже существует в таблице`;
                    showAlert(message, 'warning');
                    return false; // Прерываем цикл selectedMarkOptions
                }
            });

            if (!duplicatesFound) {
                // Продолжаем добавление столбцов только если нет дубликатов
                var currentColumns = dataTable.settings()[0].aoColumns.map(function(col) {
                    return {
                        title: col.sTitle,
                        className: col.sClass,
                        width: col.sWidth
                    };
                });

                selectedMarkOptions.each(function() {
                    var markId = $(this).val();
                    var markName = $(this).text();
                    var markNumber = markNumbers.length > 0 ? (markNumbers || '') : ''; // Безопасное получение
                    
                    currentColumns.push({
                        title: `<div data-mark-id="${markId}" data-mark-name="${markName}" data-mark-number="${markNumber}">${markName}${markNumber}</div>`,
                        className: 'dt-center',
                        defaultContent: '<div class="checkbox-container"><input type="checkbox" class="form-check-input"></div>'
                    });
                    
                    currentData = currentData.map(function(row) {
                        return [...row, '<div class="checkbox-container"><input type="checkbox" class="form-check-input"></div>'];
                    });
                });
                
                dataTable = reinitializeTable(currentData, currentColumns, checkboxStates);
                $('#addColumnModal').modal('hide');
            }
        }
    });

    // 5.5 Delete Handlers
    $('#deleteButton').on('click', function() {
        if (selectedRows.length === 0 && selectedColumns.length === 0) {
            return;
        }

        // Show warning modal
        $('#deleteWarningModal').modal('show');
    });
    
    $(document).on('click', '#confirmDelete', function() {
        var checkboxStates = getCheckboxStates();
        var currentData = dataTable.data().toArray();
        var currentColumns = dataTable.settings()[0].aoColumns.map(function(col) {
            return {
                title: col.sTitle,
                className: col.sClass,
                width: col.sWidth
            };
        });

        // Handle column deletion
        if (selectedColumns.length > 0) {
            // ИСПРАВЛЕНИЕ: Удаляем дубликаты из selectedColumns перед удалением
            var uniqueSelectedColumns = [...new Set(selectedColumns)];
            console.log("Unique selected columns for deletion:", uniqueSelectedColumns);
            
            // Remove columns in reverse order
            uniqueSelectedColumns.sort((a, b) => b - a).forEach(function(colIdx) {
                console.log(`Deleting column at index: ${colIdx}`);
                
                // Remove column from columns configuration
                currentColumns.splice(colIdx, 1);
                // Remove corresponding data from each row
                currentData = currentData.map(function(row) {
                    row.splice(colIdx, 1);
                    return row;
                });
                // Update checkbox states array
                checkboxStates = checkboxStates.map(function(rowStates) {
                    rowStates.splice(colIdx - 1, 1); // -1 потому что первый столбец не имеет чекбокса
                    return rowStates;
                });
            });
        }

        // Handle row deletion
        if (selectedRows.length > 0) {
            // ИСПРАВЛЕНИЕ: Удаляем дубликаты из selectedRows перед удалением
            var uniqueSelectedRows = [...new Set(selectedRows)];
            console.log("Unique selected rows for deletion:", uniqueSelectedRows);
            
            // ИСПРАВЛЕНИЕ: Создаем массив объектов с DOM позицией и соответствующим API индексом
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            var rowsToDeleteInfo = [];
            
            uniqueSelectedRows.forEach(function(domRowIndex) {
                // Получаем строку по DOM позиции
                var $row = $('#selectionMatrix tbody tr').eq(domRowIndex);
                if ($row.length) {
                    // Получаем API индекс этой строки
                    var apiRowIndex = api.row($row).index();
                    rowsToDeleteInfo.push({
                        domIndex: domRowIndex,
                        apiIndex: apiRowIndex
                    });
                    console.log(`DOM position ${domRowIndex} corresponds to API index ${apiRowIndex}`);
                } else {
                    console.warn(`Row not found at DOM position ${domRowIndex}`);
                }
            });
            
            // ИСПРАВЛЕНИЕ: Сортируем по API индексам для правильного удаления из currentData
            // но отслеживаем соответствующие DOM индексы для checkboxStates
            rowsToDeleteInfo.sort((a, b) => b.apiIndex - a.apiIndex);
            
            // Удаляем строки из currentData по API индексам
            rowsToDeleteInfo.forEach(function(rowInfo) {
                console.log(`Deleting row: DOM index ${rowInfo.domIndex}, API index ${rowInfo.apiIndex}`);
                
                // Убеждаемся что API индекс валиден
                if (rowInfo.apiIndex >= 0 && rowInfo.apiIndex < currentData.length) {
                    currentData.splice(rowInfo.apiIndex, 1);
                } else {
                    console.warn(`Invalid API row index for deletion: ${rowInfo.apiIndex}`);
                }
            });
            
            // ИСПРАВЛЕНИЕ: Для checkboxStates используем DOM позиции, отсортированные в обратном порядке
            var domIndicesForCheckboxes = rowsToDeleteInfo.map(info => info.domIndex).sort((a, b) => b - a);
            
            domIndicesForCheckboxes.forEach(function(domRowIndex) {
                console.log(`Deleting checkbox states for DOM index: ${domRowIndex}`);
                
                // Убеждаемся что DOM индекс валиден
                if (domRowIndex >= 0 && domRowIndex < checkboxStates.length) {
                    checkboxStates.splice(domRowIndex, 1);
                } else {
                    console.warn(`Invalid DOM row index for checkbox states deletion: ${domRowIndex}`);
                }
            });
        }

        // Use reinitializeTable for consistency
        if (selectedColumns.length > 0 || selectedRows.length > 0) {
            dataTable = reinitializeTable(currentData, currentColumns, checkboxStates);
        }

        // Clear selections and close modal
        resetSelections();
        $('#deleteWarningModal').modal('hide');
    });

    // 5.6 Modal Close Handlers
    $('.modal').on('hidden.bs.modal', function () {
        $(this).find('select').val('');
    });

    $('#addRowConfirm, #addColumnConfirm').on('click', function() {
        resetSelections();
    });

    $('#exportExcelButton').on('click', function() {
        if (!projects.fieldValueMap.selection_matrix) {
            showAlert('Матрица выбора отсутствует', 'warning');
            return;
        }

        exportToExcelViaAPI(projects.id);
    });

    // 5.8 Create Project Handler
    $('#createProjectBtn').on('click', function() {
        var selectionMatrixActual = getSelectionMatrix(projects.id, projects.fieldValueMap.name, projects.fieldValueMap.selection_matrix);

        // Проверка на пустой выбор
        if (selectionMatrixActual.objects.length === 0) {
            showAlert('Для создания проекта необходимо выбрать хотя бы один объект с маркой.', 'warning');
            return;
        }

        // Store the selection matrix in a data attribute on the button for later use
        $(this).data('selectionMatrix', selectionMatrixActual);
        
        // Show confirmation modal
        $('#createProjectConfirmModal').modal('show');
    });

    // Add handler for the confirmation button
    $(document).on('click', '#confirmCreateProject', function() {
        // Get the stored selection matrix
        var selectionMatrixActual = $('#createProjectBtn').data('selectionMatrix');
        
        // Hide the confirmation modal
        $('#createProjectConfirmModal').modal('hide');
        
        // Блокировка кнопки на время выполнения операции
        $('#createProjectBtn').prop('disabled', true).text('Создание...');

        // Создание структуры проекта в списке хранилища файлов
        createProjectStructure(projects.id, selectionMatrixActual)
        .then(response => {
            // Очищаем поля ввода
            $('#createProjectBtn').prop('disabled', true)

            // Show success alert
            showAlert(`Cтруктура проекта "${response.matrix.name}" создана/обновлена, перейти в систему хранения Vitro-CAD?`, 'success', response.project_link);
        })
        .catch(error => {
            // Восстанавливаем кнопку
            $('#createProjectBtn').prop('disabled', false)
            
            // Show error alert
            showAlert(`Ошибка при создании проекта: ${error.message || 'Неизвестная ошибка'}`, 'danger');
            console.error('Детали ошибки:', error);
        });
    });

    // Добавьте в attachTableEventHandlers() обработчик для rowReorder
    function attachTableEventHandlers() {
        dataTable.off('.dt');
        
        // Мастер-объект для хранения состояний чекбоксов по ID объекта и ID марки
        // Это наше "единое место истины" независимое от DOM
        var masterState = {};
        
        // Функция для инициализации мастер-состояния
        function initializeMasterState() {
            masterState = {};
            
            // Сканируем всю таблицу и создаем карту всех объект-марка комбинаций
            $('#selectionMatrix tbody tr').each(function() {
                var $objectDiv = $(this).find('td:first-child div');
                var objectId = $objectDiv.data('object-id');
                
                if (!objectId) return;
                
                if (!masterState[objectId]) {
                    masterState[objectId] = {};
                }
                
                // Используем DataTables API для получения заголовков
                var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
                
                // Проходим по всем ячейкам строки (кроме первой)
                $(this).find('td:not(:first-child)').each(function(cellIdx) {
                    var colIdx = $(this).index(); // Реальный индекс колонки в DOM
                    
                    // Получаем заголовок через DataTables API
                    var $header = $(api.column(colIdx).header());
                    var $div = $header.find('div');
                    
                    if ($div.length) {
                        var markId = $div.data('mark-id');
                        var markNumber = $div.data('mark-number') || '';
                        var markKey = markId + '_' + markNumber;
                        
                        // Проверяем состояние чекбокса
                        var $checkbox = $(this).find('input[type="checkbox"]');
                        var isChecked = $checkbox.length ? $checkbox[0].checked : false;
                        
                        // Сохраняем состояние в мастер-объект
                        masterState[objectId][markKey] = isChecked;
                        
                        console.log(`Initialized state for object ${objectId}, mark ${markKey}: ${isChecked}`);
                    } else {
                        console.warn(`No div found in header for column ${colIdx}`);
                    }
                });
            });
            
            console.log("Initialized master state:", JSON.stringify(masterState, null, 2));
        }
        
        // Функция для обновления состояния конкретного чекбокса в мастер-объекте
        function updateMasterState(objectId, markKey, isChecked) {
            if (!masterState[objectId]) {
                masterState[objectId] = {};
            }
            masterState[objectId][markKey] = isChecked;
            console.log(`Updated state for ${objectId}, ${markKey}: ${isChecked}`);
        }
        
        // Инициализируем мастер-состояние при загрузке
        initializeMasterState();
        
        // При изменении любого чекбокса обновляем мастер-объект
        $('#selectionMatrix').on('change', 'input[type="checkbox"]', function() {
            var $checkbox = $(this);
            var isChecked = $checkbox[0].checked;
            var $cell = $checkbox.closest('td');
            var $row = $cell.closest('tr');
            var colIdx = $cell.index();
            
            var $objectDiv = $row.find('td:first-child div');
            var objectId = $objectDiv.data('object-id');
            
            // Используем DataTables API для получения заголовка
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            var $header = $(api.column(colIdx).header());
            var $div = $header.find('div');
            
            if ($div.length) {
                var markId = $div.data('mark-id');
                var markNumber = $div.data('mark-number') || '';
                var markKey = markId + '_' + markNumber;
                
                updateMasterState(objectId, markKey, isChecked);
            } else {
                console.warn(`No div found in header for column ${colIdx} when updating state`);
            }
        });
        
        // Функция для восстановления всех чекбоксов из мастер-объекта
        function restoreAllCheckboxes() {
            console.log("Restoring all checkboxes from master state");
            
            // 1. Убеждаемся, что все чекбоксы существуют
            $('#selectionMatrix tbody tr').each(function() {
                $(this).find('td:not(:first-child)').each(function() {
                    if (!$(this).find('input[type="checkbox"]').length) {
                        $(this).html('<div class="checkbox-container"><input type="checkbox" class="form-check-input"></div>');
                    }
                });
            });
            
            // 2. Восстанавливаем состояния из мастер-объекта
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            
            $('#selectionMatrix tbody tr').each(function() {
                var $objectDiv = $(this).find('td:first-child div');
                var objectId = $objectDiv.data('object-id');
                
                if (!objectId || !masterState[objectId]) return;
                
                // Проходим по всем ячейкам строки (кроме первой)
                $(this).find('td:not(:first-child)').each(function() {
                    var colIdx = $(this).index(); // Реальный индекс колонки в DOM
                    
                    // Получаем заголовок через DataTables API
                    var $header = $(api.column(colIdx).header());
                    var $div = $header.find('div');
                    
                    if ($div.length) {
                        var markId = $div.data('mark-id');
                        var markNumber = $div.data('mark-number') || '';
                        var markKey = markId + '_' + markNumber;
                        
                        // Если для этой комбинации объект-марка есть сохраненное состояние
                        if (masterState[objectId][markKey] !== undefined) {
                            var $checkbox = $(this).find('input[type="checkbox"]');
                            
                            if ($checkbox.length) {
                                // Устанавливаем состояние напрямую через DOM-свойство
                                $checkbox[0].checked = masterState[objectId][markKey];
                                console.log(`Restored state for object ${objectId}, mark ${markKey}: ${masterState[objectId][markKey]}`);
                            }
                        }
                    }
                });
            });
            
            console.log("Restored checkboxes from master state");
        }
        
        // После любого обновления DOM восстанавливаем чекбоксы и их состояния
        // dataTable.on('draw', function() {
        //     setTimeout(restoreAllCheckboxes, 50);
        // });
        
        // При начале перетаскивания колонки
        // dataTable.on('column-reorder', function() {
        //     console.log("Column reorder started");
        // });
        
        // Замененный обработчик columns-reordered
        dataTable.on('columns-reordered', function(e, settings, details) {
            console.log("Columns reordered event:", details);
            
            // Обновляем индексы выделенных столбцов согласно новому порядку (только если есть выделенные)
            if (selectedColumns.length > 0) {
                var newSelectedColumns = [];
                
                selectedColumns.forEach(function(oldIndex) {
                    var foundNewIndex = -1;
                    
                    // ИСПРАВЛЕНИЕ: Правильно используем details.mapping
                    // details.mapping - это карта где ключ = новый индекс, значение = старый индекс
                    // Нам нужно найти новый индекс для нашего старого индекса
                    if (details && details.mapping) {
                        for (var newIdx in details.mapping) {
                            if (details.mapping[newIdx] === oldIndex) {
                                foundNewIndex = parseInt(newIdx);
                                break;
                            }
                        }
                    }
                    
                    if (foundNewIndex > 0) { // Не включаем первый столбец
                        // ИСПРАВЛЕНИЕ: Проверяем, что индекс еще не добавлен (избегаем дубликатов)
                        if (!newSelectedColumns.includes(foundNewIndex)) {
                            newSelectedColumns.push(foundNewIndex);
                            console.log(`Column moved from index ${oldIndex} to ${foundNewIndex}`);
                        }
                    } else {
                        // Fallback: если mapping не помог, ищем столбец по содержимому
                        var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
                        
                        try {
                            // Ищем выделенный заголовок в текущем состоянии
                            api.columns().every(function(currentIndex) {
                                if (currentIndex === 0) return; // Пропускаем первый столбец
                                
                                var $header = $(this.header());
                                if ($header.hasClass('selected')) {
                                    // ИСПРАВЛЕНИЕ: Проверяем, что индекс еще не добавлен (избегаем дубликатов)
                                    if (!newSelectedColumns.includes(currentIndex)) {
                                        newSelectedColumns.push(currentIndex);
                                        console.log(`Column found by selected class: now at index ${currentIndex}`);
                                    }
                                    return false; // Выходим из цикла
                                }
                            });
                        } catch (e) {
                            console.warn(`Error in fallback search:`, e);
                        }
                    }
                });
                
                // Обновляем массив выделенных столбцов
                selectedColumns = newSelectedColumns;
                console.log("Updated selectedColumns:", selectedColumns);
            }
            
            // ВАЖНО: Восстанавливаем чекбоксы ВСЕГДА, независимо от наличия выделенных столбцов
            setTimeout(function() {
                // Восстанавливаем чекбоксы из мастер-состояния
                restoreAllCheckboxes();
                
                // Обновляем визуальное выделение столбцов (только если есть выделенные)
                if (selectedColumns.length > 0) {
                    updateColumnSelection();
                }
                
                // Перепривязываем обработчики
                reattachEventHandlers();
                updateDeleteButtonState();
                
                console.log("Column reordering completed, checkboxes and selections restored");
            }, 50);
        });
        
        // Обработчик для перетаскивания строк в attachTableEventHandlers()
        dataTable.on('row-reorder', function(e, diff, edit) {
            console.log('=== ROW REORDER EVENT START ===');
            console.log('Raw diff data:', JSON.stringify(diff, null, 2));
            console.log('Current selectedRows:', selectedRows);
            
            // Обновляем индексы выделенных строк (только если есть выделенные)
            if (selectedRows.length > 0) {
                var newSelectedRows = [];
                
                // ИСПРАВЛЕННАЯ ЛОГИКА: обрабатываем только прямые перемещения выделенных строк
                selectedRows.forEach(function(oldRowIndex) {
                    console.log(`\n--- Processing selected row ${oldRowIndex} ---`);
                    var newIndex = oldRowIndex; // По умолчанию остается на месте
                    
                    // ИСПРАВЛЕНИЕ: Ищем только ПРЯМОЕ перемещение выделенной строки
                    var directMove = diff.find(function(change) {
                        return change.oldPosition === oldRowIndex;
                    });
                    
                    if (directMove) {
                        // Это наша выделенная строка - она перемещается напрямую
                        newIndex = directMove.newPosition;
                        console.log(`✓ DIRECT MOVE: Selected row ${oldRowIndex} moved to ${newIndex}`);
                    } else {
                        console.log(`✗ No direct move found for selected row ${oldRowIndex}, staying at ${newIndex}`);
                    }
                    
                    console.log(`Final result for row ${oldRowIndex}: newIndex = ${newIndex}`);
                    
                    // Добавляем новый индекс (избегаем дубликатов)
                    if (!newSelectedRows.includes(newIndex)) {
                        newSelectedRows.push(newIndex);
                        console.log(`Added ${newIndex} to newSelectedRows`);
                    } else {
                        console.log(`Skipped duplicate ${newIndex}`);
                    }
                });
                
                console.log(`\nBEFORE update: selectedRows = [${selectedRows}]`);
                console.log(`AFTER update: selectedRows = [${newSelectedRows}]`);
                
                // Обновляем массив выделенных строк СРАЗУ
                selectedRows = newSelectedRows;
            }
            
            console.log('=== ROW REORDER EVENT END ===\n');
            
            // Восстанавливаем состояние с небольшой задержкой
            setTimeout(function() {
                // Восстанавливаем чекбоксы из мастер-состояния
                restoreAllCheckboxes();
                
                // Обновляем визуальное выделение строк (только если есть выделенные)
                if (selectedRows.length > 0) {
                    updateRowSelection();
                }
                
                // Перепривязываем обработчики
                reattachEventHandlers();
                updateDeleteButtonState();
                
                console.log("Row reordering completed, selections restored to new positions");
            }, 25);
        });
    }

    // Обновленная функция для визуального выделения строк с логированием
    function updateRowSelection() {
        console.log("=== UPDATE ROW SELECTION START ===");
        console.log("Updating row selection for indices:", selectedRows);
        
        // Сначала убираем ВСЕ выделения со всех строк
        $('#selectionMatrix tbody tr').removeClass('selected');
        $('#selectionMatrix tbody tr td').removeClass('selected');
        
        // Применяем выделение только к актуальным строкам
        if (selectedRows.length > 0) {
            selectedRows.forEach(function(rowIndex) {
                console.log(`Trying to select row at DOM position ${rowIndex}`);
                
                // ИСПРАВЛЕНИЕ: Используем DOM селектор, так как selectedRows содержит DOM позиции
                var $row = $('#selectionMatrix tbody tr').eq(rowIndex);
                if ($row.length) {
                    $row.addClass('selected');
                    $row.find('td').addClass('selected');
                    
                    // Получаем текст первой ячейки для проверки
                    var objectName = $row.find('td:first-child div').text();
                    console.log(`✓ Row at DOM index ${rowIndex} marked as selected (Object: "${objectName}")`);
                } else {
                    console.warn(`✗ Row not found for DOM position ${rowIndex}`);
                }
            });
        }
        
        console.log(`=== UPDATE ROW SELECTION END ===\n`);
    }

    // Новая функция для визуального выделения столбцов
    function updateColumnSelection() {
        console.log("Updating column selection for indices:", selectedColumns);
        
        // ВАЖНО: Сначала убираем ВСЕ выделения
        $('#selectionMatrix thead th').removeClass('selected');
        $('#selectionMatrix tbody td').removeClass('column-selected');
        
        // Применяем выделение к обновленным индексам
        if (selectedColumns.length > 0) {
            var api = dataTable.api ? dataTable : $('#selectionMatrix').DataTable();
            
            selectedColumns.forEach(function(columnIndex) {
                if (columnIndex > 0) {
                    console.log(`Restoring selection for column ${columnIndex}`);
                    
                    try {
                        // Выделяем заголовок
                        var $header = $(api.column(columnIndex).header());
                        if ($header.length) {
                            $header.addClass('selected');
                        }
                        
                        // Выделяем все ячейки столбца
                        api.column(columnIndex).nodes().each(function(cell) {
                            $(cell).addClass('column-selected');
                        });
                    } catch (e) {
                        console.warn(`Error restoring selection for column ${columnIndex}:`, e);
                    }
                }
            });
        }
        
        console.log(`Updated column selection completed for indices: ${selectedColumns}`);
    }
});