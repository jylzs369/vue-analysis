# Vue源码探究-核心类的实现
*本篇源代码所在路径[vue/src/core/instance/](https://github.com/vuejs/vue/tree/v2.5.17-beta.0/src/core/instance)*

几乎所有JS框架或插件的编写都有一个类似的模式，即向全局输出一个类或者说构造函数，通过创建实例来使用这个类的公开方法，或者使用类的静态全局方法辅助实现功能。相信精通Jquery或编写过Jquery插件的开发者会对这个模式非常熟悉。Vue.js也如出一辙，只是一开始接触这个框架的时候对它所能实现的功能的感叹盖过了它也不过是一个内容较为丰富和精致的大型类的本质。

## 核心类
Vue的[核心类](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/instance/index.js)的构建文件，代码非常简单，就是一串定义构造函数的基础代码:
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

就这样完成了么！且慢，来稍微看一下初始化混合函数初步做了些啥：

## 初始化的过程

*下面代码位于[vue/src/core/instance/init.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/instance/init.js)*

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
还记得在文件组织里分析的，Component类的的具体定义可参照[这个文件](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/flow/component.js)。

初始化函数内容不多，主要做了这么几件事：
- 整理options配置对象
- 开始进入Vue实例的生命周期进程，并在生命周期相应阶段初始化实例属性和方法
- 将初始化好的对象挂载到Dom元素上，继续生命周期的运行

这部分代码已经完整地展示出了将Vue实例对象挂载到DOM元素上并执行渲染的大半程生命周期的进程，在此之后就是视图的交互过程，直到实例对象被销毁。后半段代码清晰地呈现了生命周期中各个功能的初始化顺序，也就是那张著名的生命周期图示的对应代码。

各个生命周期的初始化函数内容比较丰富，决定在另一个文档中做一个单独讨论[类初始化函数详情](Vue源码探究-类初始化函数详情.md)

---

虽然核心类的定义代码寥寥数行，但是在类初始化的过程中执行了非常多的其他功能的初始化，从这个基础的类的实现去一步步解开每一个更复杂的功能的实现可能会让学习者能逐步深入了解Vue的丰富内容，基于源代码一句句的解释虽然非常冗余，但是希望即便是基础不是特别扎实的同学也能看懂，认识到源码学习不再是大难题。

