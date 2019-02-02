<template>
    <div class="wrapper">
        <span>{{ memberType }}{{ dueId }}</span>
        <Tree :data="tree" show-checkbox multiple @on-check-change="checkItem"></Tree>
        <router-link to="/button">去Button</router-link>
        <div @click="back()">Back</div>
        <div><span>222</span></div>
    </div>
</template>

<script>
import { Tree } from 'iView'
export default {
    name: 'Hello',
    props: {
        memberType: Number,
        dueId: Number
    },
    components: {
        Tree
    },
    data () {
        return {
            tree: [
                {
                    title: 'parent 1',
                    expand: true,
                    selected: true,
                    children: [
                        {
                            title: 'parent 1-1',
                            expand: true,
                            children: [
                                {
                                    title: 'leaf 1-1-1',
                                    checked: true
                                },
                                {
                                    title: 'leaf 1-1-2'
                                }
                            ]
                        },
                        {
                            title: 'parent 1-2',
                            expand: true,
                            children: [
                                {
                                    title: 'leaf 1-2-1',
                                    checked: true
                                },
                                {
                                    title: 'leaf 1-2-1'
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    },
    created () {
        let params = {
            id: 1
        }
        this.$axios.delete('/delete/1', {params: params})
    },
    methods: {
        back () {
            console.log(window.history)
            if (window.history.length <= 1) {
                this.$router.push({name: 'Index'})
            } else {
                this.$router.back()
            }
        },
        checkItem (value, value2) {
            console.log(value, value2)
        }
    }
}
</script>
<style>
.wrapper {
    height: 100vh;
    background: #000;
}
</style>
