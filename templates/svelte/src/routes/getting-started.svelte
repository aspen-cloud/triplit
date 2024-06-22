<script lang='ts'>
const FOLDER_STRUCTURE = `/triplit
    schema.ts
/src/lib
    triplit.ts
`;

const ROOT = 'https://triplit.dev';
</script>

<div class="getting-started">
  <h1>Getting familiar with Triplit</h1>
  <p>
    This is a simple todo app that uses Triplit. You can add,
    complete, and delete todos.
  </p>
  <h2>Explore the project</h2>
  <p>
    This app is built with <a href={ROOT}>Triplit</a>,{' '}
    <a href="https://kit.svelte.dev">SvelteKit</a> and{' '}
    <a href="https://vitejs.dev">Vite</a>. There are two Triplit specific
    files:
  </p>
  <pre>{FOLDER_STRUCTURE}</pre>
  <p>
    The <code>schema.ts</code> file defines the{' '}
    <a href={ROOT + '/docs/schemas'}>schema</a> for the todos. The{' '}
    <code>triplit.ts</code> file initializes the{' '}
    <a href={ROOT + '/docs/client'}>Triplit client</a>.
  </p>
  <h2>Run the sync server</h2>
  <p>In a separate terminal window, run the sync server:</p>
  <pre>
    <code>npm run triplit dev</code>
  </pre>
  <h2>Watch it sync</h2>
  <p>
    Open a new browser window or tab and navigate to{' '}
    <a href="http://localhost:3000">http://localhost:3000</a>. You should
    see the todos you added in the other window.
  </p>
  <h2>Go offline</h2>
  <p>
    Put your browser in offline mode and add, complete, and delete todos.
  </p>
  <h2>Go online</h2>
  <p>
    ... and you should see everything sync up again. That's the magic of{' '}
    <a href="https://triplit.dev">Triplit</a>.
  </p>
  <h2>Read more</h2>
  <p>
    Read our <a href="https://triplit.dev/docs">docs</a> to learn more about
    everything you can do with Triplit.
  </p>
</div>
