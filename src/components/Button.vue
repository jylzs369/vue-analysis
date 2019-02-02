<template>
  <div class="wrapper">
    <div @click="back()">Back</div>
  </div>
</template>

<script>
export default {
  name: 'Button',
  methods: {
    back () {
      console.log(window.history)
      if (window.history.length <= 1) {
        this.$router.push({name: 'Index'})
      } else {
        this.$router.go(-1)
      }
    }
  }
}
</script>

<style scoped>
div {
  color: #fff;
}
</style>
