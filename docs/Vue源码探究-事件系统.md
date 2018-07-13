# Vue源码探究-事件系统

*本章代码位于[vue/src/core/instance/events.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/events.js)*

紧跟着生命周期之后的就是继续初始化事件相关的属性和方法。整个事件系统的代码相对其他模块来说非常简短，分几个部分来详细看看它的所有具体实现。

## 头部引用
```js
import {
  tip,
  toArray,
  hyphenate,
  handleError,
  formatComponentName
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'
```
头部先是引用了的一些工具方法，没有什么难点，具体可以查看相应文件。唯一值得注意的是引用自虚拟节点模块的一个叫 `updateListeners` 方法。顾名思义，是用来更新监听器的，至于为什么要有这样的一个方法，主要是因为如果该实例的父组件已经存在一些事件监听器，为了正确捕获到事件并向上冒泡，父级事件是需要继承下来的；另外，如果在实例初始化的时候绑定了同名的事件处理器，也需要为同名事件添加新的处理器，以实现同一事件的多个监听器的绑定，这个原因在下面的初始化代码中有佐证。

## 事件初始化
```js
// 定义并导出initEvents函数，接受Component类型的vm参数
export function initEvents (vm: Component) {
  // 创建例的_events属性，初始化为空对象
  vm._events = Object.create(null)
  // 创建实例的_hasHookEvent属性，初始化为false
  vm._hasHookEvent = false
  // 初始化父级附属事件
  // init parent attached events
  const listeners = vm.$options._parentListeners
  // 如果父级事件存在，则更新实例事件监听器
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

// 设置target值，目标是引用实例
let target: any

// 添加事件函数，接受事件名称、事件处理器、是否一次性执行三个参数
function add (event, fn, once) {
  if (once) {
    target.$once(event, fn)
  } else {
    target.$on(event, fn)
  }
}

// 移除事件函数，接受事件名称和时间处理器两个参数
function remove (event, fn) {
  target.$off(event, fn)
}

// 定义并导出函数updateComponentListeners，接受实例对象，新旧监听器参数
export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  // 设置target为vm
  target = vm
  // 执行更新监听器函数，传入新旧事件监听对象、添加事件与移除事件函数、实例对象
  updateListeners(listeners, oldListeners || {}, add, remove, vm)
  // 置空引用
  target = undefined
}
```
如上述代码所示，事件监听系统的初始化首先是创建了私有的事件对象和是否有事件钩子的标志两个属性，然后根据父级是否有事件处理器来决定是否更新当前实例的事件监听器，具体如何实现监听器的更新，贴上这段位于[虚拟节点模块的辅助函数](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/vdom/helpers/update-listeners.js)中的代码片段来仔细看看。

### 更新事件监听器
```js
// 定义并导出updateListeners哈数
// 接受新旧事件监听器对象，事件添加和移除函数以及实例对象参数。
export function updateListeners (
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  vm: Component
) {
  // 定义一些辅助变量
  let name, def, cur, old, event
  // 遍历新的监听器对象
  for (name in on) {
    // 为def和cur赋值为新的事件对象
    def = cur = on[name]
    // 为old赋值为旧的事件对象
    old = oldOn[name]
    // 标准化事件对象并赋值给event。normalizeEvent函数主要是用于将传入的带有特殊前缀的事件字符串分解为具有特定值的事件对象
    event = normalizeEvent(name)
    // 下面代码是weex框架专用，处理cur变量和格式化好的事件对象的参数属性
    /* istanbul ignore if */
    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler
      event.params = def.params
    }
    // 如果新事件不存在，在非生产环境中提供报错信息，否则不执行任何操作
    if (isUndef(cur)) {
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    // 当旧事件不存在时
    } else if (isUndef(old)) {
      // 如果新事件对象cur的fns属性不存在
      if (isUndef(cur.fns)) {
        // 创建函数调用器并重新复制给cur和on[name]
        cur = on[name] = createFnInvoker(cur)
      }
      // 添加新的事件处理器
      add(event.name, cur, event.once, event.capture, event.passive, event.params)
    // 如果新旧事件不完全相等
    } else if (cur !== old) {
      // 用新事件处理函数覆盖旧事件对象的fns属性
      old.fns = cur
      // 将事件对象重新复制给on
      on[name] = old
    }
  }
  // 遍历旧事件监听器
  for (name in oldOn) {
    // 如果新事件对象不存在
    if (isUndef(on[name])) {
      // 标准化事件对象
      event = normalizeEvent(name)
      // 移除事件处理器
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
```

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