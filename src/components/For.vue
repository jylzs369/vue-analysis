<template>
  <div id="root">
    <Select
      key="123"
      v-model="model1"
      @on-change="changeArr"
      style="width:200px"> 
      <Option
        v-for="item in cityList"
        :value="item.value"
        :label="item.label"
        :key="item.value"/>
    </Select>
  </div>
</template>

<script>
import { Select, Option } from 'iview'
export default {
    name: 'For',
    components: {
        Select,
        Option
    },
    data () {
        return {
            breadcrumb: [],
            dropdown: [],
            btninfo: {},
            cityList: [
                {
                    value: 'New York',
                    label: 'New York'
                },
                {
                    value: 'London',
                    label: 'London'
                },
                {
                value: 'Sydney',
                label: 'Sydney'
                },
                {
                    value: 'Ottawa',
                    label: 'Ottawa'
                },
                {
                    value: 'Paris',
                    label: 'Paris'
                },
                {
                    value: 'Canberra',
                    label: 'Canberra'
                },
                {
                    value: 'Japan',
                    label: 'Japan'
                },
                {
                    value: 'Japan1',
                    label: 'Japan1'
                },
                {
                    value: 'Japan2',
                    label: 'Japan2'
                },
                {
                    value: 'Japan3',
                    label: 'Japan3'
                },
                {
                    value: 'Japan4',
                    label: 'Japan4'
                },
                {
                    value: 'Japan5',
                    label: 'Japan5'
                },
                {
                    value: 'Japan6',
                    label: 'Japan6'
                },
                {
                    value: 'Japan7',
                    label: 'Japan7'
                },
                {
                    value: 'Japan87',
                    label: 'Japan87'
                },
                {
                    value: 'Japan9',
                    label: 'Japan9'
                },
                {
                    value: 'Japan10',
                    label: 'Japan10'
                },
                {
                    value: 'Japan11',
                    label: 'Japan11'
                }
            ],
            model1: ''
        }
    },
    created () {
        console.log(this.$router)
    },
    methods: {
        changeArr () {
            this.cityList.reverse()
        }
    }
}
var str = 'For more information, see Chapter 3.4.5.1';
var re = /see (chapter \d+(\.\d)*)/i;
var found = str.match(re);
</script>