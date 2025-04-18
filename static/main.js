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

        var selectionMatrix = { 
            id: projectId,
            name: projectName,
            folder_structure_id: originalMatrix.folder_structure_id || "",
            objects: []
        };

        var processedObjects = new Map();
        
        // Get all checked checkboxes
        $('#selectionMatrix input[type="checkbox"]:checked').each(function() {
            var $checkbox = $(this);
            var $row = $checkbox.closest('tr');
            var $col = $checkbox.closest('td');
            
            // Get object info from the first cell
            var $objectCell = $row.find('td:first-child div');
            var objectId = $objectCell.data('object-id');
            var objectName = $objectCell.data('object-name');
            var objectNumber = $objectCell.data('object-number');
        
            // Get mark info from the column header
            var colIndex = $col.index();
            var $markHeader = $('#selectionMatrix thead th').eq(colIndex).find('div');
            var markId = $markHeader.data('mark-id');
            var markName = $markHeader.data('mark-name');
            var markNumber = $markHeader.data('mark-number');
        
            // Create or update object entry
            if (!processedObjects.has(objectId)) {
                // Find the object in the original matrix
                var folderStructureId = "";
                var originalObj = originalMatrix.objects.find(obj => obj.id === objectId);
                if (originalObj) {
                    folderStructureId = originalObj.folder_structure_id || "";
                }
                
                processedObjects.set(objectId, {
                    id: objectId,
                    name: objectName,
                    number: objectNumber,
                    folder_structure_id: folderStructureId,
                    to_remove: false,
                    deleted: false,
                    marks: []
                });
            }

            // Add mark to object
            var objectEntry = processedObjects.get(objectId);
            
            // Check if we already have the mark's folder_structure_id
            var markFolderStructureId = "";
            var originalObj = originalMatrix.objects.find(obj => obj.id === objectId);
            if (originalObj && originalObj.marks) {
                var originalMark = originalObj.marks.find(mark => 
                    mark.id === markId && 
                    (mark.number || "") === (markNumber || "")
                );
                if (originalMark) {
                    markFolderStructureId = originalMark.folder_structure_id || "";
                }
            }
            
            objectEntry.marks.push({
                id: markId,
                name: markName,
                number: markNumber || "",
                folder_structure_id: markFolderStructureId,
                to_remove: false,
                deleted: false
            });
        });
        
        // Convert Map to array
        selectionMatrix.objects = Array.from(processedObjects.values());
        
        // Identify removed objects and marks if we have an original matrix
        if (originalMatrix && originalMatrix.objects && originalMatrix.objects.length > 0) {
            // Create a merged objects array containing both current and removed objects
            const mergedObjects = [...selectionMatrix.objects];
            
            // First, identify objects that should be marked for removal
            originalMatrix.objects.forEach(originalObj => {
                // Skip already deleted objects
                if (originalObj.deleted === true) {
                    // Include deleted objects in the final matrix but ensure they're not marked for removal again
                    const deletedObj = {
                        ...originalObj,
                        to_remove: false,
                        deleted: true
                    };
                    
                    // Only add if not already present
                    if (!mergedObjects.some(obj => obj.id === originalObj.id)) {
                        mergedObjects.push(deletedObj);
                    }
                    return; // Skip further processing for this object
                }

                const stillExists = selectionMatrix.objects.some(obj => obj.id === originalObj.id);
                
                if (!stillExists) {
                    // This object is no longer selected - mark for removal but keep it
                    const objectToRemove = {
                        ...originalObj,
                        to_remove: true,
                        deleted: false
                    };
                    
                    // Also mark all marks inside this object for removal
                    if (originalObj.marks && Array.isArray(originalObj.marks)) {
                        objectToRemove.marks = originalObj.marks.map(mark => {
                            // Skip already deleted marks
                            if (mark.deleted === true) {
                                return {
                                    ...mark,
                                    to_remove: false,
                                    deleted: true
                                };
                            }
                            return {
                                ...mark,
                                to_remove: true,
                                deleted: false
                            };
                        });
                    }
                    
                    mergedObjects.push(objectToRemove);
                } else {
                    // For existing objects, process their marks
                    const currentObj = selectionMatrix.objects.find(obj => obj.id === originalObj.id);
                    
                    if (originalObj.marks && Array.isArray(originalObj.marks)) {
                        // Create a merged marks array for this object
                        const currentObjIndex = mergedObjects.findIndex(obj => obj.id === originalObj.id);
                        const mergedMarks = [...mergedObjects[currentObjIndex].marks];
                        
                        // Check each original mark
                        originalObj.marks.forEach(originalMark => {
                            // Skip already deleted marks
                            if (originalMark.deleted === true) {
                                // Include deleted marks but don't mark for removal again
                                const deletedMark = {
                                    ...originalMark,
                                    to_remove: false,
                                    deleted: true
                                };
                                
                                // Only add if not already present
                                if (!mergedMarks.some(mark => 
                                    mark.id === originalMark.id && 
                                    (mark.number || "") === (originalMark.number || "")
                                )) {
                                    mergedMarks.push(deletedMark);
                                }
                                return;
                            }

                            const markStillExists = currentObj.marks.some(mark => 
                                mark.id === originalMark.id && 
                                (mark.number || "") === (originalMark.number || "")
                            );
                            
                            if (!markStillExists) {
                                // This mark is no longer selected - mark for removal but keep it
                                const markToRemove = {
                                    ...originalMark,
                                    to_remove: true,
                                    deleted: false
                                };
                                mergedMarks.push(markToRemove);
                            }
                        });
                        
                        // Replace marks array with merged one
                        mergedObjects[currentObjIndex].marks = mergedMarks;
                    }
                }
            });
            
            // Replace objects array with merged one
            selectionMatrix.objects = mergedObjects;
        }
        
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
                    className: 'dt-center select-cell',
                    width: '200px'
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

    //4. Initialization of table data and project info
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
});