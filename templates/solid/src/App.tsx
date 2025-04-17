import { Component, createSignal, For } from 'solid-js';

import logo from './logo.svg';
import styles from './App.module.css';
import { GettingStarted } from './components/GettingStarted.jsx';
import { ConnectionStatus } from './components/ConnectionStatus.jsx';
import { Todo } from './components/Todo.jsx';
import { Query, triplit } from '../triplit/client.js';
import { useQuery } from '@triplit/solid';

function useTodos() {
  const todosQuery = Query('todos').Order('created_at', 'DESC');
  const { results: todos, error, fetching } = useQuery(triplit, todosQuery);
  return { todos, error, fetching };
}

const App: Component = () => {
  const [text, setText] = createSignal('');
  // const [todos, setTodos] = createSignal([]);
  const { todos, fetching: initialFetching } = useTodos();
  const [fetching, setFetching] = createSignal(false);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (text().trim()) {
      // setTodos([...todos(), { id: Date.now(), text: text().trim() }]);
      triplit.insert('todos', {
        text: text().trim(), // The text of the todo
        completed: false, // Default to not completed
      });
      setText('');
    }
  };

  return (
    <div class="main-container">
      <GettingStarted />
      <div class="app-container">
        <h1>Todos</h1>
        <ConnectionStatus />
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="What needs to be done?"
            class="todo-input"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          <button class="btn" type="submit" disabled={!text().trim()}>
            Add Todo
          </button>
        </form>
        {fetching() && <p>Loading...</p>}
        <div class="todos-container">
          <For each={todos()}>
            {(todo) => <Todo key={todo.id} todo={todo} />}
          </For>
        </div>
      </div>
    </div>
  );
};

export default App;
