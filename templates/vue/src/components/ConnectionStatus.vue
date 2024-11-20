<script setup lang="ts">
import { useConnectionStatus } from '@triplit/vue'
import { triplit } from '@/lib/client'

const { connectionStatus } = useConnectionStatus(triplit)
</script>

<template>
  <div class="connection-status">
    <div :class="`indicator ${connectionStatus.toLowerCase()}`"></div>
    {{
      connectionStatus === 'CLOSED'
        ? 'Offline'
        : connectionStatus === 'CONNECTING'
          ? 'Connecting'
          : 'Online'
    }}
  </div>
</template>
