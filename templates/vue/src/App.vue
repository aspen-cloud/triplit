<script setup lang="ts">
import Todo from './components/Todo.vue'
import { schema } from "../triplit/schema";
import { useQuery, useConnectionStatus } from "@triplit/vue";
import { computed } from 'vue';

import { client } from "./triplit";
const { fetching, results, error } = useQuery(client, client.query('todos'));
const { status: connectionStatus } = useConnectionStatus(client);
const todos = computed(() => results.value ? [...results.value.values()] : []);
</script>

<template>
  <div>
    <div class="title">
      <h1>Todos</h1>
      <span v-if="connectionStatus === 'OPEN'">🟢</span>
      <span v-else-if="connectionStatus === 'CLOSED'">🔴</span>
      <span v-else>🟡</span>
    </div>
    <span v-if="fetching">Loading...</span>
    <span v-else-if="error">Error: {{ error.message }}</span>
    <!-- We can assume by this point that `isSuccess === true` -->
    <ul v-else>

      <!-- <li v-for="todo in todos" :key="todo.id">{{ todo.text }}</li> -->
      <Todo v-for="todo in todos" :key="todo.id" :id="todo.id" :text="todo.text" :completed="todo.completed" />
    </ul>
  </div>
  <!-- <HelloWorld msg="Vite + Vue + Triplit" /> -->
</template>

<style scoped>
.title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 1em;
}
</style>
