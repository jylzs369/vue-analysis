# Vue源码探究-类的实现
*本篇源代码所在路径[vue/src/core/instance/](https://github.com/vuejs/vue/tree/dev/src/core/instance)*

几乎所有JS框架或插件的编写都有一个类似的模式，即向全局输出一个类或者说构造函数，通过创建实例来使用这个类的公开方法，或者使用类的静态全局方法辅助实现功能。相信精通Jquery或编写过Jquery插件的开发者会对这个模式非常熟悉。Vue.js也如出一辙，只是一开始接触这个框架的时候对它所能实现的功能的感叹盖过了它也不过是一个内容较为丰富和精致的大型类的本质。

## 核心类
Vue的[核心类](https://github.com/vuejs/vue/blob/dev/src/core/instance/index.js)的构建文件，代码非常简单，就是一串定义构造函数的基础代码:
```js
// 定义Vue构造函数，形参options
function Vue (options) {
  // 安全性判断，如果不是生产环境且不是Vue的实例，在控制台输出警告
  if (process.env.NODE_ENV !== 'production' && !(this instanceof Vue) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 满足条件后执行初始化
  this._init(options)
}
```
但是Vue所有功能的实现，这只是一个开始：
```js
// 引入初始化混合函数
import { initMixin } from './init'
// 引入状态混合函数
import { stateMixin } from './state'
// 引入视图渲染混合函数
import { renderMixin } from './render'
// 引入事件混合函数
import { eventsMixin } from './events'
// 引入生命周期混合函数
import { lifecycleMixin } from './lifecycle'
// 引入warn控制台错误提示函数
import { warn } from '../util/index'
...

// 挂载初始化方法
initMixin(Vue)
// 挂载状态处理相关方法
stateMixin(Vue)
// 挂载事件响应相关方法
eventsMixin(Vue)
// 挂载生命周期相关方法
lifecycleMixin(Vue)
// 挂载视图渲染方法
renderMixin(Vue)
```

在类构造文件的头部引入了同目录下5个文件中的混合函数（我认为这里只是为了要表示把一些方法混入到初始类中才统一用了Mixin的后缀，所以不要深究以为这是什么特殊的函数），分别是初始化 `initMixin` 、状态 `stateMixin` 、渲染 `renderMixin`、事件 `eventsMixin`、生命周期 `lifecycleMixin`。在文件尾部将这几个函数里包含的具体方法挂载到Vue原始类上。

从各个细化模块，可以看出作者是如何进行逻辑架构分类的。这里又学到了一种模块开发的好方法，将类继承方法按模块独立编写，单独进行挂载实现了可插拔的便利性。

```js
export default Vue
```
文件最后的经典代码。到此Vue的类构造完成！

就这样完成了么！且慢，来稍微看一下各个混合函数初步做了些啥：

## 按模块挂载的方法

### 初始化
*下面代码位于[vue/src/core/instance/init.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/init.js)*

最先为基础类挂载的方法就是`_init()`，这是唯一在类实例化的过程中执行的函数，位于整个函数栈的最底层，其他的功能将在此方法里初步分化。

```js
// 导出ininMixin函数，接收形参Vue，
// 使用Flow进行静态类型检查指定为Component类
export function initMixin (Vue: Class<Component>) {
  // 在Vue类的原型上挂载_init()方法
  // 接收类型为原始对象的options形参，此参数为非必选参数
  Vue.prototype._init = function (options?: Object) {
    // 将实例对象赋值给vm变量
    // 这里会再次进行Component类型检查确保vm接收到的是Vue类的实例
    const vm: Component = this
    // 给实例对象vm定义_uid属性，作为vue实例的唯一标识ID
    // uid是在函数外定义的变量，从0开始增量赋值
    // a uid
    vm._uid = uid++
    // 定义startTag、endTag变量
    let startTag, endTag
    // 注释的意思是代码覆盖率检测工具istanbul会忽略if分支
    // 因为下面代码是专为性能分析使用的，以后都不做分析
    /* istanbul ignore if */
    // 非生产环境且进行性能分析的时候执行以下代码
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      // mark是进行性能分析的工具函数，目前可忽略
      mark(startTag)
    }
    // 给vm设置一个_isVue属性作为标记，避免被观察
    // 猜想可能是之后观察者进行监视的时候会忽略掉有这个标记的对象
    // 具体原因待以后分析
    // a flag to avoid this being observed
    vm._isVue = true
    // 合并options对象
    // merge options
    // 如果是内部组件则执行初始化内部组件函数
    // 这里特意区分出内部定义的组件，是为了进行特别处理提升优化
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 否则执行合并options函数，并赋值给vm的公共属性
      // 在这里的合并函数主要是解决与继承自父类的配置对象的合并
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    // 忽略代码覆盖，在非生产环境初始化代理
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    // 暴露实例对象
    vm._self = vm
    // 初始化实例的生命周期相关属性
    initLifecycle(vm)
    // 初始化事件相关属性和监听功能
    initEvents(vm)
    // 初始化渲染相关属性和功能
    initRender(vm)
    // 调用生命周期钩子函数beforeCreate
    callHook(vm, 'beforeCreate')
    // 初始化父组件注入属性
    initInjections(vm) // resolve injections before data/props
    // 初始化状态相关属性和功能
    initState(vm)
    // 初始化子组件属性提供器
    initProvide(vm) // resolve provide after data/props
    // 调用生命周期钩子函数created
    callHook(vm, 'created')

    // 性能检测代码
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 执行DOM元素挂载函数
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}
```
还记得在文件组织里分析的，Component类的的具体定义可参照[这个文件](https://github.com/vuejs/vue/blob/dev/flow/component.js)。

初始化函数内容不多，主要做了这么几件事：
- 整理options配置对象
- 开始进入Vue实例的生命周期进程，并在生命周期相应阶段初始化实例属性和方法
- 将初始化好的对象挂载到Dom元素上，继续生命周期的运行

这部分代码已经完整地展示出了将Vue实例对象挂载到DOM元素上并执行渲染的大半程生命周期的进程，在此之后就是视图的交互过程，直到实例对象被销毁。后半段代码清晰地呈现了生命周期中各个功能的初始化顺序，也就是那张著名的生命周期图示的对应代码。

各个生命周期的初始化函数内容比较丰富，决定在另一个文档中做一个单独讨论[初始化函数详情](Vue源码探究-初始化函数详情.md)


### 状态
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
```js
export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        this.$on(event[i], fn)
      }
    } else {
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        this.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    if (!fn) {
      vm._events[event] = null
      return vm
    }
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

  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
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
    let cbs = vm._events[event]
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
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
eventsMixin的内容非常直观，分别为实例原型对象挂载了`$on`、`$once`、`$off`、`$emit`四个方法，内容比较简单，不一一注释解释了。

### 生命周期
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
```js
// 导出renderMixin函数，接收形参Vue，
// 使用Flow进行静态类型检查指定为Component类
export function renderMixin (Vue: Class<Component>) {
  // 为Vue原型对象绑定运行时相关的辅助方法
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  // 定义Vue原型对象的$nextTick方法，接收函数类型的fn形参
  Vue.prototype.$nextTick = function (fn: Function) {
    // nextTick函数的执行结果
    return nextTick(fn, this)
  }

  // 定义Vue原型对象的_render方法，期望返回虚拟节点对象
  Vue.prototype._render = function (): VNode {
    // 将实例赋值给vm变量
    const vm: Component = this
    // 导出vm的$options对象的render方法和_parentVnode对象
    const { render, _parentVnode } = vm.$options

    // 重置插槽上的_rendered标志以进行重复插槽检查
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

    // 设置父虚拟节点，允许render函数访问占位符节点的数据
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