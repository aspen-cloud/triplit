<script lang="ts">
  import { useQuery } from '@triplit/svelte';
  import { triplit, Query} from '$lib/client';
  import GettingStarted from './getting-started.svelte';
  import ConnectionStatus from './connection-status.svelte';
  import Todo from './todo.svelte';

  let text = $state('');
  const todos = useQuery(
    triplit,
    Query('todos').Order('created_at', 'DESC'),
    {}
  );
</script>

<div class="main-container">
  <GettingStarted />
  <div class="app-container">
    <h1>Todos</h1>
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
      <div class="todos-container">
        {#each todos.results as todo}
          <Todo {todo} />
        {/each}
      </div>
    {/if}
  </div>
</div>
