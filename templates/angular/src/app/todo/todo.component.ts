import { Component, Input } from '@angular/core';
import { Todo } from '../../../triplit/schema.js';
import { triplit } from '../../../triplit/client.js';

@Component({
  selector: 'app-todo',
  standalone: true,
  template: `
    <div class="todo">
      <input
        type="checkbox"
        [checked]="todo.completed"
        (change)="toggleCompleted()"
      />
      {{ todo.text }}
      <button class="x-button" (click)="deleteTodo()">❌</button>
    </div>
  `,
})
export class TodoComponent {
  @Input({ required: true }) todo!: Todo;
  deleteTodo = async () => {
    await triplit.delete('todos', this.todo.id);
  };
  toggleCompleted = async () => {
    await triplit.update('todos', this.todo.id, async (entity) => {
      entity.completed = !this.todo.completed;
    });
  };
}
