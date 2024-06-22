import React, { useState } from 'react';
import { useQuery } from '@triplit/react';
import { triplit } from '../triplit/client.ts';
import { Todo } from './components/Todo.tsx';
import { GettingStarted } from './components/GettingStarted.tsx';
import { ConnectionStatus } from './components/ConnectionStatus.tsx';

function useTodos() {
  const todosQuery = triplit.query('todos').order('created_at', 'DESC');
  const { results: todos, error, fetching } = useQuery(triplit, todosQuery);
  return { todos, error, fetching };
}

export default function App() {
  const [text, setText] = useState('');
  const { todos, fetching } = useTodos();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await triplit.insert('todos', { text });
    setText('');
  };

  return (
    <div className="app">
      <GettingStarted />
      <div className="todos-container">
        <ConnectionStatus />
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="What needs to be done?"
            className="todo-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn" type="submit" disabled={!text}>
            Add Todo
          </button>
        </form>
        {fetching && <p>Loading...</p>}
        {todos && (
          <div>
            {Array.from(todos).map(([id, todo]) => (
              <Todo key={id} todo={todo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
