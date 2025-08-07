export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'project_manager' | 'technician' | 'viewer'
  department: 'engineering' | 'quality' | 'regulatory' | 'clinical'
}

export interface Project {
  id: string
  name: string
  description: string
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  deviceType: 'class_i' | 'class_ii' | 'class_iii'
  regulatoryFramework: 'fda' | 'ce' | 'iso13485' | 'multiple'
  startDate: Date
  endDate: Date
  phases: Phase[]
  assignedUsers: User[]
  createdAt: Date
  updatedAt: Date
}

export interface Phase {
  id: string
  projectId: string
  name: string
  description: string
  order: number
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  startDate: Date
  endDate: Date
  tasks: Task[]
  dependencies: string[]
}

export interface Task {
  id: string
  phaseId: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assignedTo: User[]
  tags: string[]
  estimatedHours: number
  actualHours: number
  dueDate: Date
  subtasks: Subtask[]
  attachments: Attachment[]
  comments: Comment[]
}

export interface Attachment {
  id: string
  fileName: string
  fileType: string
  url: string
  uploadedAt: Date
  uploadedBy: User
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  completed: boolean
  assignedTo?: User
}