<script lang="ts">
  import { useConnectionStatus } from '@triplit/svelte';
  import { triplit } from '$lib/client';

  const connection = useConnectionStatus(triplit);
</script>

<div class="connection-status">
  {#if connection.status === 'OPEN'}
    Connected
  {:else if connection.status === 'CONNECTING'}
    Connecting...
  {:else}
    Disconnected
  {/if}
</div>
