<script setup lang="ts">
import { triplit } from '../lib/client'

const props = defineProps<{ id: string; completed: boolean; text: string }>()

function toggleStatus(id: string) {
  triplit.update('todos', id, (todo) => {
    todo.completed = !todo.completed
  })
}

function deleteTodo(id: string) {
  triplit.delete('todos', id)
}
</script>

<template>
  <div class="todo">
    <input @click="toggleStatus(props.id)" type="checkbox" :checked="props.completed" />
    {{ props.text }}
    <button class="x-button" @click="deleteTodo(props.id)">❌</button>
  </div>
</template>
