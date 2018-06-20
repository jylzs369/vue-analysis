# Vue源码探究-类初始化函数详情

### 状态
*下面代码位于[vue/src/core/instance/state.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/state.js)*
```js
// 导出stateMixin函数，接收形参Vue，
// 使用Flow进行静态类型检查指定为Component类
export function stateMixin (Vue: Class<Component>) {
  // 使用 Object.defineProperty 方法直接声明定义对象时，flow会发生问题
  // 所以必须在此程序化定义对象
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  // 定义dataDef对象
  const dataDef = {}
  // 定义dataDef的get方法，返回Vue实例私有属性_data
  dataDef.get = function () { return this._data }
  // 定义propsDef对象
  const propsDef = {}
  // 定义propsDef的get方法，返回Vue实例私有属性_props
  propsDef.get = function () { return this._props }
  // 非生产环境下，定义dataDef和propsDef的set方法
  if (process.env.NODE_ENV !== 'production') {
    // dataDef的set方法接收Object类型的newData形参
    dataDef.set = function (newData: Object) {
      // 提示避免传入对象覆盖属性$data
      // 推荐使用嵌套的数据属性代替
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    // 设置propsDef的set方法为只读
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 定义Vue原型对象公共属性$data，并赋值为dataDef
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  // 定义Vue原型对象公共属性$props，并赋值为propsDef
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 定义Vue原型对象的$set方法，并赋值为从观察者导入的set函数
  Vue.prototype.$set = set
  // 定义Vue原型对象的$delete方法，并赋值为从观察者导入的del函数
  Vue.prototype.$delete = del

  // 定义Vue原型对象的$watch方法
  // 接收字符串或函数类型的expOrFn，从命名中可看出希望为表达式或函数
  // 接收任何类型的cb，这里希望为回调函数或者是一个对象
  // 接收对象类型的options
  // 要求返回函数类型
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    // 把实例赋值给vm变量，类型需为Component
    const vm: Component = this
    // 如果cb是纯粹的对象类型
    if (isPlainObject(cb)) {
      // 返回createWatcher函数
      return createWatcher(vm, expOrFn, cb, options)
    }
    // 否则定义options
    options = options || {}
    // 定义options的user属性值为true
    options.user = true
    // 创建watcher实例
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 如果options的immediate为真
    if (options.immediate) {
      // 在vm上调用cb回调函数，并传入watcher.value作为参数
      cb.call(vm, watcher.value)
    }
    // 返回unwatchFn函数
    return function unwatchFn () {
      // 执行watcher.teardown()方法清除观察
      watcher.teardown()
    }
  }
}
```
stateMixin执行的是关于状态观察的一系列方法的并入，主要是三个方面：
- 定义实例$data和$props属性的存取器
- 定义实例的$set、$delete方法，具体实在定义在观察者模块中
- 定义实例的$watch方法



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

### 生命周期
*下面代码位于[vue/src/core/instance/lifecycle.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/lifecycle.js)*
```js
export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode
    const prevActiveInstance = activeInstance
    activeInstance = vm
    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    activeInstance = prevActiveInstance
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}
```

### 渲染
*下面代码位于[vue/src/core/instance/render.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/render.js)*
```js
// 导出renderMixin函数，接收形参Vue，
// 使用Flow进行静态类型检查指定为Component类
export function renderMixin (Vue: Class<Component>) {
  // 为Vue原型对象绑定运行时相关的辅助方法
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  // 挂载Vue原型对象的$nextTick方法，接收函数类型的fn形参
  Vue.prototype.$nextTick = function (fn: Function) {
    // nextTick函数的执行结果
    return nextTick(fn, this)
  }

  // 挂载Vue原型对象的_render方法，期望返回虚拟节点对象
  Vue.prototype._render = function (): VNode {
    // 将实例赋值给vm变量
    const vm: Component = this
    // 导出vm的$options对象的render方法和_parentVnode对象
    const { render, _parentVnode } = vm.$options

    // 非生产环境下重置插槽上的_rendered标志以进行重复插槽检查
    // reset _rendered flag on slots for duplicate slot check
    if (process.env.NODE_ENV !== 'production') {
      for (const key in vm.$slots) {
        // $flow-disable-line
        vm.$slots[key]._rendered = false
      }
    }

    // 如果有父级虚拟节点，定义并赋值实例的$scopedSlots属性
    if (_parentVnode) {
      vm.$scopedSlots = _parentVnode.data.scopedSlots || emptyObject
    }

    // 设置实例的父虚拟节点，允许render函数访问占位符节点的数据
    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    vm.$vnode = _parentVnode
    // 渲染节点
    // render self
    let vnode
    // 在实例的渲染代理对象上调用render方法，并传入$createElement参数
    try {
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      // 处理错误
      handleError(e, vm, `render`)
      // 返回错误渲染结果或者前一虚拟节点，防止渲染错误导致的空白组件
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      // 非生产环境特殊处理渲染错误
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        if (vm.$options.renderError) {
          try {
            vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
          } catch (e) {
            handleError(e, vm, `renderError`)
            vnode = vm._vnode
          }
        } else {
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    }
    // 在渲染函数出错时返回空虚拟节点
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      // 非生产环境报错
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      // 创建空的虚拟节点
      vnode = createEmptyVNode()
    }
    // 设置父虚拟节点
    // set parent
    vnode.parent = _parentVnode
    // 返回虚拟节点
    return vnode
  }
}
```

渲染模块挂载了两个方法`$nextTick`公共方法和`_render`私有方法。关于渲染的具体实现，后面会有专门文章来做分析。

