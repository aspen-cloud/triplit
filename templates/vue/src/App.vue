<script setup lang="ts">
import { useQuery } from '@triplit/vue'
import { triplit, Query } from '@/lib/client'
import GettingStarted from '@/components/GettingStarted.vue'
import ConnectionStatus from '@/components/ConnectionStatus.vue'
import Todo from '@/components/Todo.vue'
import { ref } from 'vue'

let text = ref('')
const state = useQuery(triplit, Query('todos').Order('created_at', 'DESC'))
function onSubmit() {
  triplit.insert('todos', { text: text.value })
  text.value = ''
}
</script>

<template>
  <main class="main-container">
    <GettingStarted />
    <div class="app-container">
      <h1>Todos</h1>
      <ConnectionStatus />
      <form @submit.prevent="onSubmit">
        <input v-model="text" placeholder="What needs to be done?" class="todo-input" />
        <button class="btn" type="submit" :disabled="!text">Add Todo</button>
      </form>
      <p v-if="state.fetching">Loading...</p>
      <div v-if="state.results" class="todos-container">
        <Todo
          v-for="todo in state.results"
          :id="todo.id"
          :text="todo.text"
          :completed="todo.completed"
          :created_at="todo.created_at"
        />
      </div>
    </div>
  </main>
</template>
