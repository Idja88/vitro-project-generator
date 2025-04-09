$(document).ready(function () {
    // 1. Global Variables
    var dataTable;
    var projects = [];
    var objects = [];
    var marks = [];
    var selectedRows = [];
    var selectedColumns = [];

    $.ajaxPrefilter(function(options) {
        if (options.url.startsWith('/') && APP_CONFIG.PREFIX) {
            const originalUrl = options.url;
            options.url = APP_CONFIG.PREFIX + options.url;
        }
    });

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
        $('.selected, .column-selected').removeClass('selected column-selected');
        updateDeleteButtonState();
    }

    function reattachEventHandlers() {
        // Удаляем все существующие обработчики
        $('#selectionMatrix tbody').off('click', '**');
        $('#selectionMatrix thead').off('click', '**');

        // Обработчик выделения строк
        $('#selectionMatrix tbody').on('click', 'td.select-cell', function(e) {
            e.stopPropagation();
            var row = $(this).closest('tr');
            var rowIdx = dataTable.row(row).index();
            
            row.toggleClass('selected');
            
            if (row.hasClass('selected')) {
                if (!selectedRows.includes(rowIdx)) {
                    selectedRows.push(rowIdx);
                }
            } else {
                selectedRows = selectedRows.filter(idx => idx !== rowIdx);
            }
            
            updateDeleteButtonState();
        });
    
        // Обработчик выделения столбцов
        $('#selectionMatrix thead').on('click', 'th:not(:first-child)', function(e) {
            e.stopPropagation();
            var colIdx = $(this).index();
            $(this).toggleClass('selected');
            
            // Выделение всего столбца
            dataTable.column(colIdx).nodes().each(function() {
                $(this).toggleClass('column-selected');
            });
            
            if ($(this).hasClass('selected')) {
                if (!selectedColumns.includes(colIdx)) {
                    selectedColumns.push(colIdx);
                }
            } else {
                selectedColumns = selectedColumns.filter(idx => idx !== colIdx);
            }
            
            updateDeleteButtonState();
        });
    }

    function updateDeleteButtonState() {
        var hasSelection = selectedRows.length > 0 || selectedColumns.length > 0;
        $('#deleteButton').prop('disabled', !hasSelection);
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
                    targets: '_all',
                    width: "100px",
                }
            ],
            language: {
                emptyTable: "Нет данных в таблице"
            },
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
        
        return dataTable;
    }

    function getSelectionMatrix(projectId, projectName) {
        var selectionMatrix = { 
            id: projectId,
            name: projectName,
            folder_structure_id: "",
            objects: []
        };
        var processedObjects = new Map();
    
        // Получаем все отмеченные чекбоксы
        $('#selectionMatrix input[type="checkbox"]:checked').each(function() {
            var $checkbox = $(this);
            var $row = $checkbox.closest('tr');
            var $col = $checkbox.closest('td');
            
            // Получаем ID и имя объекта из первой ячейки строки
            var $objectCell = $row.find('td:first-child div');
            var objectId = $objectCell.data('object-id');
            var objectName = $objectCell.data('object-name');
            var objectNumber = $objectCell.data('object-number');
    
            // Получаем ID и имя марки из заголовка столбца
            var colIndex = $col.index();
            var $markHeader = $('#selectionMatrix thead th').eq(colIndex).find('div');
            var markId = $markHeader.data('mark-id');
            var markName = $markHeader.data('mark-name');
            var markNumber = $markHeader.data('mark-number');
    
            // Создаем или обновляем запись объекта
            if (!processedObjects.has(objectId)) {
                processedObjects.set(objectId, {
                    id: objectId,
                    name: objectName,
                    number: objectNumber,
                    folder_structure_id: "",
                    marks: []
                });
            }

            // Добавляем марку к объекту
            var objectEntry = processedObjects.get(objectId);
            objectEntry.marks.push({
                id: markId,
                name: markName,
                number: markNumber,
                folder_structure_id: ""
            });
        });
    
        // Преобразуем Map в массив объектов
        selectionMatrix.objects = Array.from(processedObjects.values());
        return selectionMatrix;
    }

    // Add utility function for alerts at the top of the file
    function showAlert(message, type) {
        // Get modal elements
        const modal = $('#alertModal');
        const header = modal.find('.modal-header');
        const title = modal.find('.modal-title');
        
        // Reset classes
        header.removeClass('bg-success bg-danger bg-warning');
        
        // Set type-specific styles
        switch(type) {
            case 'success':
                header.addClass('bg-success text-white');
                title.text('Успешно');
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
        
        // Show modal
        modal.modal('show');
        
        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                modal.modal('hide');
            }, 5000);
        }
    }

    // 3. API Functions

    // Load project info by ID
    function loadProjectInfo(projectId) {
        return new Promise((resolve, reject) => {
            $.getJSON(`/get/projects/${projectId}`, function (project) {
                $('#projectName').val(project.fieldValueMap.name);
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
                var dropdown = $('#customerDropdown');
                dropdown.empty();
                dropdown.append($('<option value="">Выберите заказчика</option>'));
                
                $.each(customers, function (index, customer) {
                    dropdown.append($('<option></option>')
                        .attr('value', customer.id)
                        .text(customer.fieldValueMap.name));
                });
                resolve(customers);
            }).fail(function (jqXHR, textStatus, errorThrown) {
                console.error("Ошибка загрузки заказчиков:", textStatus, errorThrown);
                $('#customerDropdown').html('<option value="">Ошибка загрузки</option>');
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

    // Update project info
    function updateProjectInfo(projectId, projectName, selectionMatrix) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `/set/update/${projectId}`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    projectName: projectName,
                    selectionMatrix: selectionMatrix 
                }),
                success: function(response) {
                    console.log('Информация о проекте успешно обновлена:', response);
                    resolve(response);
                },
                error: function(xhr, status, error) {
                    console.error('Ошибка при обновлении информации о проекте:', xhr.responseJSON || error);
                    reject({
                        stage: 'update',
                        status: status,
                        message: xhr.responseJSON?.error || 'Ошибка обновления данных проекта',
                        details: xhr.responseText
                    });
                }
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

    // 4. Initialization
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

                // Prepare columns for DataTable
                let columns = [{
                    title: 'Объект проектирования',
                    className: 'dt-center select-cell',
                    width: '200px'
                }];
                
                // Map to track mark columns by ID
                const markColumnsMap = new Map();
                
                // Process all objects and their marks to build unique mark columns
                selectionMatrix.objects.forEach(obj => {
                    obj.marks.forEach(mark => {
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
                selectionMatrix.objects.forEach(obj => {
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
                    
                    // Mark checkboxes for associated marks
                    obj.marks.forEach(mark => {
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
                            targets: '_all',
                            width: "100px",
                        }
                    ],
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
        
        // Reset button states
        updateDeleteButtonState();
    }

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
                className: 'dt-center select-cell',
                width: '200px'
            }],
            columnDefs: [
                {
                targets: '_all',
                width: "100px",
                }
            ],
            drawCallback: function() {
                reattachEventHandlers();
            }
        });
    }

    //4.2 Table Initialize
    initializeEmptyTable();

    //4.1 Load project info if needed
    if (PROJECT_ID) {
        loadProjectInfo(PROJECT_ID)
            .then(project => {
                // Check if project was already generated
                if (project.fieldValueMap.is_created_by_generator === true) {
                    // Disable all interactive elements
                    $('#newRowButton, #newColumnButton, #deleteButton, #createProjectBtn').prop('disabled', true);
                    
                    // Disable the entire table
                    $('#selectionMatrix').addClass('disabled-table');
                    $('#selectionMatrix input').prop('disabled', true);
                    
                    // Show alert to user
                    showAlert("Этот проект уже был создан с помощью генератора. Повторная генерация невозможна.", "warning");
                    
                    return; // Exit early
                }

                // Enable the create button if needed
                if (project.fieldValueMap.is_created_by_generator === false) {
                    $('#createProjectBtn').prop('disabled', false);
                    initializeTable(project.fieldValueMap.selection_matrix);
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
        if ($('#customerDropdown option').length <= 1) {
            $('#customerDropdown').prop('disabled', true);
            $('#objectDropdown')
                .empty()
                .append($('<option value="">Загрузка...</option>'))
                .prop('disabled', true);
            $('#addRowConfirm').prop('disabled', true);
            
            loadCustomersDropdown(projects.fieldValueMap.project_company_id)
                .then(() => {
                    $('#customerDropdown').prop('disabled', false);
                    $('#objectDropdown')
                        .empty()
                        .append($('<option value="">Сначала выберите заказчика</option>'));
                })
                .catch(() => {
                    $('#customerDropdown').html('<option value="">Ошибка загрузки</option>');
                    $('#customerDropdown').prop('disabled', true);
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

    // 5.2 Dropdown Change Handlers
    $('#customerDropdown').change(function() {
        var selectedCustomerId = $(this).val();
        var objectDropdown = $('#objectDropdown');
        var addRowConfirmBtn = $('#addRowConfirm');
        var newRowBtn = $('#newRowButton');
        
        if (selectedCustomerId) {
            loadObjectsDropdown(selectedCustomerId)
                .then(() => {
                    // Enable all related controls
                    objectDropdown.prop('disabled', false);
                    addRowConfirmBtn.prop('disabled', false);
                    newRowBtn.prop('disabled', false);
                })
                .catch(error => {
                    console.error('Ошибка при загрузке объектов:', error);
                    // Disable all related controls
                    objectDropdown.prop('disabled', true);
                    addRowConfirmBtn.prop('disabled', true);
                    newRowBtn.prop('disabled', true);
                });
        } else {
            // Reset and disable controls when no customer selected
            objectDropdown
                .empty()
                .append($('<option value="">Сначала выберите заказчика</option>'))
                .prop('disabled', true);
            addRowConfirmBtn.prop('disabled', true);
            newRowBtn.prop('disabled', true);
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

    $('#addColumnConfirm').on('click', function() {
        var selectedMarkOptions = $('#markDropdown option:selected');
        var selectedMarkNumberOptions = $('#markNumberDropdown option:selected');
        var markNumbers = selectedMarkNumberOptions.map(function() {
            return $(this).val();
        }).get();

        if (selectedMarkOptions.length > 0) {        
            var checkboxStates = getCheckboxStates();
            var currentData = dataTable.data().toArray();
            var duplicatesFound = false;
            
            // Получаем все текущие заголовки с их markId и markNumber
            var existingHeaders = [];
            $('#selectionMatrix thead th').each(function() {
                var $div = $(this).find('div');
                if ($div.length) {
                    existingHeaders.push({
                        markId: $div.data('mark-id'),
                        markNumber: $div.data('mark-number'),
                        text: $div.text()
                    });
                }
            });

            // Проверяем каждую выбранную марку на дубликаты
            selectedMarkOptions.each(function() {
                var markId = $(this).val();
                var markName = $(this).text();
                var markNumber = markNumbers[0];
                
                // Проверяем на дубликаты
                var duplicate = existingHeaders.find(function(header) {
                    var sameId = header.markId === markId;
                    var sameNumber = (markNumber.toString() === header.markNumber.toString());
                    return sameId && sameNumber;
                });

                if (duplicate) {
                    duplicatesFound = true;
                    var message = markNumber ? 
                        `Марка "${markName}" с номером раздела "${markNumber}" уже существует в таблице` :
                        `Марка "${markName}" без номера раздела уже существует в таблице`;
                    showAlert(message, 'warning');
                    return false; // Прерываем цикл
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
                    var markNumber = markNumbers[0];
                    
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

    // 5.4 Selection Handlers
    $('#selectionMatrix tbody').on('click', 'td.select-cell', function(e) {
        e.stopPropagation(); // Prevent event bubbling
        var row = $(this).closest('tr');
        var rowIdx = dataTable.row(row).index();
        
        row.toggleClass('selected');
        
        if (row.hasClass('selected')) {
            if (!selectedRows.includes(rowIdx)) {
                selectedRows.push(rowIdx);
            }
        } else {
            selectedRows = selectedRows.filter(idx => idx !== rowIdx);
        }
        console.log('Selected rows:', selectedRows); // Debug
        
        updateDeleteButtonState();
    });
    
    $('#selectionMatrix thead').on('click', 'th:not(:first-child)', function(e) {
        e.stopPropagation(); // Prevent event bubbling
        var colIdx = $(this).index();
        $(this).toggleClass('selected');
        
        // Highlight entire column
        var column = dataTable.column(colIdx);
        column.nodes().each(function() {
            $(this).toggleClass('column-selected');
        });
        
        if ($(this).hasClass('selected')) {
            if (!selectedColumns.includes(colIdx)) {
                selectedColumns.push(colIdx);
            }
        } else {
            selectedColumns = selectedColumns.filter(idx => idx !== colIdx);
        }
        console.log('Selected columns:', selectedColumns); // Debug
        
        updateDeleteButtonState();
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
            // Remove columns in reverse order
            selectedColumns.sort((a, b) => b - a).forEach(function(colIdx) {
                // Remove column from columns configuration
                currentColumns.splice(colIdx, 1);
                // Remove corresponding data from each row
                currentData = currentData.map(function(row) {
                    row.splice(colIdx, 1);
                    return row;
                });
                // Update checkbox states array
                checkboxStates = checkboxStates.map(function(rowStates) {
                    rowStates.splice(colIdx - 1, 1); // -1 because first column doesn't have checkbox
                    return rowStates;
                });
            });
        }

        // Handle row deletion
        if (selectedRows.length > 0) {
            // Remove rows in reverse order
            selectedRows.sort((a, b) => b - a).forEach(function(rowIdx) {
                currentData.splice(rowIdx, 1);
                checkboxStates.splice(rowIdx, 1);
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

    // 5.8 Create Project Handler
    $('#createProjectBtn').on('click', function() {
        var selectionMatrixActual = getSelectionMatrix(projects.id, projects.fieldValueMap.name);

        // Проверка на пустой выбор
        if (selectionMatrixActual.objects.length === 0) {
            showAlert('Для создания проекта необходимо выбрать хотя бы один объект с маркой.', 'warning');
            return;
        }

        // Блокировка кнопки на время выполнения операции
        $('#createProjectBtn').prop('disabled', true).text('Создание...');
        
        // Создание структуры проекта в списке хранилища файлов
        createProjectStructure(projects.id, selectionMatrixActual)
            .then(response => {
                // Очищаем поля ввода
                $('#createProjectBtn').prop('disabled', true).text('Создать проект');

                // Reinitialize table to fresh state
                initializeEmptyTable();
                
                // Show success alert
                showAlert(`Проект "${response[0].fieldValueMap.name}" успешно создан! ID: ${response[0].id}`, 'success');
            })
            .catch(error => {
                // Восстанавливаем кнопку
                $('#createProjectBtn').prop('disabled', false).text('Создать проект');
                
                // Show error alert
                showAlert(`Ошибка при создании проекта: ${error.message || 'Неизвестная ошибка'}`, 'danger');
                console.error('Детали ошибки:', error);
            });
    });

});