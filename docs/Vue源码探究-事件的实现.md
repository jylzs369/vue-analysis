
### 事件
*下面代码位于[vue/src/core/instance/events.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/events.js)*
```js
// 导出eventsMixin函数，接收形参Vue，
// 使用Flow进行静态类型检查指定为Component类
export function eventsMixin (Vue: Class<Component>) {
  // 定义hook正则检验
  const hookRE = /^hook:/
  // 给Vue原型对象挂载$on方法
  // 参数event可为字符串或数组类型，fn是事件监听函数
  // 方法返回实例对象本身
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    // 定义实例变量
    const vm: Component = this
    // 如果传入的event参数是数组，遍历event数组，为所有事件注册fn监听函数
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        this.$on(event[i], fn)
      }
    } else {
      // event参数为字符串时，检查event事件监听函数数组是否存在
      // 已存在事件监听数组则直接添加新监听函数
      // 否则建立空的event事件监听函数数组，再添加新监听函数
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // 此处做了性能优化，使用正则检验hook:是否存在的布尔值
      // 而不是hash值查找设置实例对象的_hasHookEvent值
      // 此次优化是很久之前版本的修改，暂时不太清楚以前hash值查找是什么逻辑，留待以后查证
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    // 返回实例本身
    return vm
  }
  // 为Vue原型对象挂载$once方法
  // 参数event只接受字符串，fn是监听函数
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    // 定义实例变量
    const vm: Component = this
    // 创建on函数
    function on () {
      // 函数执行后先清除event事件绑定的on监听函数，即函数本身
      // 这样以后就不会再继续监听event事件
      vm.$off(event, on)
      // 在实例上运行fn监听函数
      fn.apply(vm, arguments)
    }
    // 为on函数设置fn属性，保证在on函数内能够正确找到fn函数
    on.fn = fn
    // 为event事件注册on函数
    vm.$on(event, on)
    // 返回实例本身
    return vm
  }
  // 为Vue原型对象挂载$off方法
  // event参数可为字符串或数组类型
  // fn是监听函数，为可选参数
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    // 定义实例变量
    const vm: Component = this
    // 如果没有传入参数，则清除实例对象的所有事件
    // 将实例对象的_events私有属性设置为null，并返回实例
   // all
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // 如果event参数传入数组，清除所有event事件的fn监听函数返回实例
    // 这里是$off方法递归执行，最终会以单一事件为基础来实现监听的清除
    // array of events
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        this.$off(event[i], fn)
      }
      return vm
    }
    // 如果指定单一事件，将事件的监听函数数组赋值给cbs变量
    // specific event
    const cbs = vm._events[event]
    // 如果没有注册此事件监听则返回实例
    if (!cbs) {
      return vm
    }
    // 如果没有指定监听函数，则清除所有该事件的监听函数，返回实例
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // 如果指定监听函数，则遍历事件监听函数数组，移除指定监听函数返回实例
    if (fn) {
      // specific handler
      let cb
      let i = cbs.length
      while (i--) {
        cb = cbs[i]
        if (cb === fn || cb.fn === fn) {
          cbs.splice(i, 1)
          break
        }
      }
    }
    return vm
  }
  // 为Vue原型对象挂载$emit方法，只接受单一event
  Vue.prototype.$emit = function (event: string): Component {
    // 定义实例变量
    const vm: Component = this
    // 在非生产环境下，传入的事件字符串如果是驼峰值且有相应的小写监听事件
    // 则提示事件已注册，且无法使用驼峰式注册事件
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    // 将事件监听函数数组赋值 给cbs
    let cbs = vm._events[event]
    // 如果监听函数数组存在
    if (cbs) {
      // 重置cbs变量，为何要使用toArray方法转换一次数组不太明白？
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // 将event之后传入的所有参数定义为args数组
      const args = toArray(arguments, 1)
      // 遍历所有监听函数，为实例执行每一个监听函数，并传入args参数数组
      for (let i = 0, l = cbs.length; i < l; i++) {
        try {
          cbs[i].apply(vm, args)
        } catch (e) {
          handleError(e, vm, `event handler for "${event}"`)
        }
      }
    }
    return vm
  }
}
```
eventsMixin的内容非常直观，分别为实例原型对象挂载了`$on`、`$once`、`$off`、`$emit`四个方法。这是实例事件监听函数的注册、一次性注册、移除和触发的内部实现。在使用的过程中会对这些实现有一个更清晰的理解。