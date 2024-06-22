<script lang="ts">
import { triplit } from '$lib/client';
import { type Todo } from '../../triplit/schema';
export let todo: Todo;

</script>

<div class="todo">
  <input
    type="checkbox"
    checked={todo.completed}
    onchange={async () =>
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
    class="x-button"
    onclick={async () => {
      // Delete the todo
      await triplit.delete('todos', todo.id);
    }}
  >
    ❌
  </button>
</div>

