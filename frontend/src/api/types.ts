// Типы ответов /api/v1 (backend/vitro_generator/api/__init__.py).
// Матрица выбора приходит и уходит в формате хранения Vitro-CAD (snake_case).

export interface MatrixMark {
  id: string
  name: string
  number: string | number
  folder_structure_id: string
  deleted: boolean
  to_remove: boolean
  to_restore: boolean
}

export interface MatrixObject {
  id: string
  name: string
  number: string | number
  folder_structure_id: string
  deleted: boolean
  to_remove: boolean
  to_restore: boolean
  marks: MatrixMark[]
}

/** Колонка таблицы в mark_order: марка и номер раздела (АР, АР1 и АР2 — три колонки одной марки). */
export interface MarkOrderEntry {
  id: string
  number: string
}

export interface SelectionMatrix {
  id: string
  name: string
  folder_structure_id: string
  /** Порядок колонок-марок слева направо. Необязателен в старых матрицах. */
  mark_order?: MarkOrderEntry[]
  objects: MatrixObject[]
}

export interface Project {
  id: string
  name: string
  code: string
  chief: string | null
  /** Площадка проекта (object_list_lookup_tree) — родитель для списка объектов. */
  objectParentId: string | null
  isGenerated: boolean
  matrix: SelectionMatrix | null
}

export interface DesignObject {
  id: string
  name: string
  number: string
}

export interface Mark {
  id: string
  code: string
  name: string
}

export interface AppConfig {
  vitroBaseUrl: string | null
  objectListUrl: string | null
  markListUrl: string | null
}

export type ActionType = 'create' | 'remove' | 'restore'

export interface PreviewAction {
  type: ActionType
  kind: 'project' | 'object' | 'mark'
  name: string
  /** Для марок — объект, в котором она создаётся; null для марок «Общего объекта». */
  object: string | null
}

export interface Preview {
  actions: PreviewAction[]
  summary: Record<ActionType, number>
}

export interface ApplyResult {
  matrix: SelectionMatrix
  project_link: string
}
