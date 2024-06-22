import { type Todo } from '../../triplit/schema';
import { triplit } from '../../triplit/client';

export function Todo({ todo }: { todo: Todo }) {
  return (
    <div className="todo">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={async () =>
          // Update the todo's completed status
          // `triplit.update` is an async function that takes the entity type
          //  the entity ID, and a callback function that updates the entity
          await triplit.update('todos', todo.id, async (entity) => {
            entity.completed = !todo.completed;
          })
        }
      />
      {todo.text}
      <button
        className="x-button"
        onClick={async () => {
          // Delete the todo
          await triplit.delete('todos', todo.id);
        }}
      >
        ❌
      </button>
    </div>
  );
}
