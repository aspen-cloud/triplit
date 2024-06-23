<script lang="ts">
  import { useQuery } from '@triplit/svelte';
  import { triplit } from '$lib/client';
  import GettingStarted from './getting-started.svelte';
  import ConnectionStatus from './connection-status.svelte';
  import Todo from './todo.svelte';

  let text = $state('');
  const todos = useQuery(
    triplit,
    triplit.query('todos').order('created_at', 'DESC'),
  );
  let todosArray = $derived(todos.results ? Array.from(todos.results) : []);
</script>

<div class="app">
  <GettingStarted />
  <div class="todos-container">
    <ConnectionStatus />
    <form
      onsubmit={async (e) => {
        e.preventDefault();
        await triplit.insert('todos', { text });
        text = '';
      }}
    >
      <input
        type="text"
        placeholder="What needs to be done?"
        class="todo-input"
        bind:value={text}
      />
      <button class="btn" type="submit" disabled={!text}> Add Todo </button>
    </form>
    {#if todos.fetching}
      <p>Loading...</p>
    {/if}
    {#if todos.results}
      <div>
        {#each todosArray as [_key, todo]}
          <Todo {todo} />
        {/each}
      </div>
    {/if}
  </div>
</div>
