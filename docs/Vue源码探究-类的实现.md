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
  // 否则执行初始化
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

且慢，来稍微看一下各个混合函数都初步做了些啥：

## 按模块挂载的方法

### 初始化
```js
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}
```


### 状态

### 渲染

### 事件

### 生命周期