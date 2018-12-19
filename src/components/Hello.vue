<template>
    <div>{{ memberType }}{{ dueId }}</div>
</template>

<script>
export default {
    name: 'Hello',
    props: {
        memberType: Number,
        dueId: Number
    }
}
</script>