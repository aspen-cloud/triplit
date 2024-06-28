<script setup lang="ts">
import { client } from "../triplit";

const props = defineProps<{ id: string, text: string, completed: boolean }>()


function toggleStatus(id) {
    console.log
    client.update('todos', id, (todo) => {
        todo.completed = !todo.completed;
    });
}

</script>

<template>
    <div>
        <input @click="toggleStatus(props.id)" type="checkbox" :checked="props.completed" />
        <!-- <input type="checkbox" /> -->
        <span :class="{ 'completed': props.completed }">{{ props.text }}</span>
    </div>
</template>

<style scoped>
.completed {
    text-decoration: line-through;
}
</style>