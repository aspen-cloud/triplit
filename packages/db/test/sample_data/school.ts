export const departments = [
  { name: 'math', id: 'dep-1' },
  { name: 'history', id: 'dep-2' },
  { name: 'english', id: 'dep-3' },
  { name: 'economics', id: 'dep-4' },
];
export const classes = [
  {
    id: 'class-1',
    name: 'Calculus 1',
    level: 100,
    department: 'dep-1',
    enrolled_students: ['student-2', 'student-3', 'student-4', 'student-5'],
  },
  {
    id: 'class-2',
    name: 'Calculus 2',
    level: 200,
    department: 'dep-1',
    enrolled_students: ['student-1'],
  },
  {
    id: 'class-3',
    name: 'African American Migrations',
    level: 100,
    department: 'dep-2',
    enrolled_students: ['student-1', 'student-3', 'student-5'],
  },
  {
    id: 'class-4',
    name: 'Dutch Maritime Empires',
    level: 200,
    department: 'dep-2',
    enrolled_students: ['student-2', 'student-3', 'student-4'],
  },
  {
    id: 'class-5',
    name: 'Linear Algebra',
    level: 300,
    department: 'dep-1',
    enrolled_students: ['student-6'],
  },
];
export const students = [
  { id: 'student-1', name: 'John James' },
  { id: 'student-2', name: 'Susie Lou' },
  { id: 'student-3', name: 'Marry Anne' },
  { id: 'student-4', name: 'Charlie Reynolds' },
  { id: 'student-5', name: 'Leslie Blake' },
  { id: 'student-6', name: 'Dylan Smith' },
];
