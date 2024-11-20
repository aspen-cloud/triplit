import { Component, computed, effect } from '@angular/core';
import { ConnectionStatusComponent } from './connection-status/connection-status.component.js';
import { GettingStartedComponent } from './getting-started/getting-started.component.js';
import { TodoComponent } from './todo/todo.component.js';
import { triplit } from '../../triplit/client.js';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { injectQuery } from '@triplit/angular';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    ConnectionStatusComponent,
    GettingStartedComponent,
    TodoComponent,
    ReactiveFormsModule,
  ],
  template: `
    <div class="main-container">
      <app-getting-started />
      <div class="app-container">
        <h1>Todos</h1>
        <app-connection-status />
        <form (submit)="handleSubmit($event)">
          <input
            type="text"
            placeholder="What needs to be done?"
            class="todo-input"
            [formControl]="draftTodo"
          />
          <button class="btn" type="submit">Add Todo</button>
        </form>
        @if (queryResults.fetching()) {
          <p>Loading...</p>
        }
        @if (queryResults.results()) {
          <div class="todos-container">
            @for (todo of queryResults.results(); track todo.id) {
              <app-todo [todo]="todo" />
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class AppComponent {
  draftTodo = new FormControl('');
  handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!this.draftTodo.value) return;
    await triplit.insert('todos', { text: this.draftTodo.value });
    this.draftTodo.setValue('');
  };
  queryResults = injectQuery(() => ({
    //@ts-ignore
    client: triplit,
    //@ts-ignore
    query: triplit.query('todos').order('created_at', 'DESC'),
  }));
}
