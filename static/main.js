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
        //$('#selectionMatrix tbody').on('click', 'td', function(e) {
        $('#selectionMatrix tbody').on('click', 'td:not(:first-child)', function(e) {

            // Проверяем, был ли клик на чекбоксе или его контейнере
            if ($(e.target).is('input[type="checkbox"]')) {
                return; // Игнорируем клики на чекбоксы
            }
            
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
            // dataTable.column(colIdx).nodes().each(function() {
            //     $(this).toggleClass('column-selected');
            // });
            
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
                update: true,
                snapX: true,
            },
            select: false,
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
        
        return dataTable;
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
        
            // Get mark info from the column header
            var colIndex = $col.index();
            var $markHeader = $('#selectionMatrix thead th').eq(colIndex).find('div');
            var markId = $markHeader.data('mark-id');
            var markName = $markHeader.data('mark-name');
            var markNumber = $markHeader.data('mark-number');
        
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
                        update: true,
                        snapX: true,
                    },
                    select: false,
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
                update: true,
                snapX: true,
            },
            select: false,
            drawCallback: function() {
                reattachEventHandlers();
            }
        });
    }

    // 4. Initialization of table data and project info
    if (PROJECT_ID) {
        loadProjectInfo(PROJECT_ID)
            .then(project => {
                // Check if project was already generated
                if (project.fieldValueMap.is_created_by_generator === true) {
                    $('#createProjectBtn').text('Обновить проект').prop('disabled', false);
                    initializeEmptyTable();
                    initializeTable(project.fieldValueMap.selection_matrix);
                }

                // If not genereated, initialize empty table
                if (project.fieldValueMap.is_created_by_generator === false) {
                    $('#createProjectBtn').text('Создать проект').prop('disabled', false);
                    initializeEmptyTable();
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
    // $('#selectionMatrix tbody').on('click', 'td.select-cell', function(e) {
    //     e.stopPropagation(); // Prevent event bubbling
    //     var row = $(this).closest('tr');
    //     var rowIdx = dataTable.row(row).index();
        
    //     row.toggleClass('selected');
        
    //     if (row.hasClass('selected')) {
    //         if (!selectedRows.includes(rowIdx)) {
    //             selectedRows.push(rowIdx);
    //         }
    //     } else {
    //         selectedRows = selectedRows.filter(idx => idx !== rowIdx);
    //     }

    //     console.log("Selected rows:", selectedRows);

    //     updateDeleteButtonState();
    // });
    
    // $('#selectionMatrix thead').on('click', 'th:not(:first-child)', function(e) {
    //     e.stopPropagation(); // Prevent event bubbling
    //     var colIdx = $(this).index();
    //     $(this).toggleClass('selected');
        
    //     // Highlight entire column
    //     var column = dataTable.column(colIdx);
    //     column.nodes().each(function() {
    //         $(this).toggleClass('column-selected');
    //     });
        
    //     if ($(this).hasClass('selected')) {
    //         if (!selectedColumns.includes(colIdx)) {
    //             selectedColumns.push(colIdx);
    //         }
    //     } else {
    //         selectedColumns = selectedColumns.filter(idx => idx !== colIdx);
    //     }

    //     console.log("Selected columns:", selectedColumns);
        
    //     updateDeleteButtonState();
    // });

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
            showAlert(`Проект "${response.name}" успешно создан! ID: ${response.id}`, 'success');
        })
        .catch(error => {
            // Восстанавливаем кнопку
            $('#createProjectBtn').prop('disabled', false)
            
            // Show error alert
            showAlert(`Ошибка при создании проекта: ${error.message || 'Неизвестная ошибка'}`, 'danger');
            console.error('Детали ошибки:', error);
        });
    });

    // Добавьте эту функцию сразу после инициализации таблицы в любом месте 
    function attachTableEventHandlers() {
        // Удаляем существующие обработчики
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
                
                // Для каждого объекта проверяем все марки
                $('#selectionMatrix thead th').each(function(colIdx) {
                    if (colIdx === 0) return; // Skip first column
                    
                    var $div = $(this).find('div');
                    if (!$div.length) return;
                    
                    var markId = $div.data('mark-id');
                    var markNumber = $div.data('mark-number') || '';
                    var markKey = markId + '_' + markNumber;
                    
                    // Проверяем состояние чекбокса для данной комбинации объект-марка
                    var $cell = $($('#selectionMatrix tbody tr').get($objectDiv.closest('tr').index()))
                                .find('td').eq(colIdx);
                    var $checkbox = $cell.find('input[type="checkbox"]');
                    var isChecked = $checkbox.length ? $checkbox[0].checked : false;
                    
                    // Сохраняем состояние в мастер-объект
                    masterState[objectId][markKey] = isChecked;
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
            
            var $markHeader = $('#selectionMatrix thead th').eq(colIdx).find('div');
            var markId = $markHeader.data('mark-id');
            var markNumber = $markHeader.data('mark-number') || '';
            var markKey = markId + '_' + markNumber;
            
            updateMasterState(objectId, markKey, isChecked);
        });
        
        // Функция для восстановления всех чекбоксов из мастер-состояния
        function restoreAllCheckboxes() {
            console.log("Restoring all checkboxes from master state");
            
            // 1. Сначала убеждаемся, что все чекбоксы существуют
            $('#selectionMatrix tbody tr').each(function() {
                $(this).find('td:not(:first-child)').each(function() {
                    if (!$(this).find('input[type="checkbox"]').length) {
                        $(this).html('<div class="checkbox-container"><input type="checkbox" class="form-check-input"></div>');
                    }
                });
            });
            
            // 2. Восстанавливаем состояния из мастер-объекта
            $('#selectionMatrix tbody tr').each(function() {
                var $objectDiv = $(this).find('td:first-child div');
                var objectId = $objectDiv.data('object-id');
                
                if (!objectId || !masterState[objectId]) return;
                
                // Для каждого объекта проверяем все марки
                $('#selectionMatrix thead th').each(function(colIdx) {
                    if (colIdx === 0) return; // Пропускаем первый столбец
                    
                    var $div = $(this).find('div');
                    if (!$div.length) return;
                    
                    var markId = $div.data('mark-id');
                    var markNumber = $div.data('mark-number') || '';
                    var markKey = markId + '_' + markNumber;
                    
                    // Если для этой комбинации объект-марка есть сохраненное состояние
                    if (masterState[objectId][markKey] !== undefined) {
                        var $cell = $($('#selectionMatrix tbody tr').get($objectDiv.closest('tr').index()))
                                    .find('td').eq(colIdx);
                        var $checkbox = $cell.find('input[type="checkbox"]');
                        
                        if ($checkbox.length) {
                            // Устанавливаем состояние напрямую через DOM-свойство
                            $checkbox[0].checked = masterState[objectId][markKey];
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
        
        // После перемещения столбцов
        dataTable.on('columns-reordered', function() {
            console.log("Columns reordered - restoring all checkboxes");
            
            // Даем небольшую задержку для обновления DOM
            setTimeout(function() {
                restoreAllCheckboxes();
                
                // Перепривязываем обработчики
                reattachEventHandlers();
            }, 100);
        });
        
        // При перемещении строк
        dataTable.on('row-reordered', function() {
            console.log("Row reordered - restoring all checkboxes");
            
            // Даем небольшую задержку для обновления DOM
            setTimeout(function() {
               restoreAllCheckboxes();
                
                // Перепривязываем обработчики
               reattachEventHandlers();
            }, 100);
        });
    }
});