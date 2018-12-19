<template>
  <div id="app">
    <router-view/>
    <Hello :memberType="memberType" :dueId="dueId" />
  </div>
</template>

<script>
import Hello from '@/components/Hello.vue'
export default {
  name: 'App',
  components: {
    Hello
  },
  data () {
    return {
      memberType: 1,
      dueId: 2
    }
  }
}
</script>

<style>
</style>
