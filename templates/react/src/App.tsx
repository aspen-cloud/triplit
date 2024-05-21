import React, { useState } from 'react';
import { useQuery } from '@triplit/react';
import { triplit } from '../triplit/client';
import Todo from './components/Todo';

function useTodos() {
	const todosQuery = triplit.query('todos').order('created_at', 'DESC');
	const { results: todos, error, fetching } = useQuery(triplit, todosQuery);
	return { todos, error, fetching };
}

export default function App() {
	const [text, setText] = useState('');
	const { todos } = useTodos();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		await triplit.insert('todos', { text });
		setText('');
	};

	return (
		<div className="app">
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
			{todos && (
				<div>
					{Array.from(todos).map(([id, todo]) => (
						<Todo key={id} todo={todo} />
					))}
				</div>
			)}
		</div>
	);
}
