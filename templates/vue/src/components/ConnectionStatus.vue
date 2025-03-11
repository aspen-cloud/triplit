<script setup lang="ts">
import { useConnectionStatus } from '@triplit/vue'
import { triplit } from '@/lib/client'

const connection = useConnectionStatus(triplit)
</script>

<template>
  <div class="connection-status">
    <div :class="`indicator ${connection.status.toLowerCase()}`"></div>
    {{
      connection.status === 'CLOSED'
        ? 'Offline'
        : connection.status === 'CONNECTING'
          ? 'Connecting'
          : 'Online'
    }}
  </div>
</template>
