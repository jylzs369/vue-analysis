# Vue源码探究-生命周期

*本章代码位于[vue/src/core/instance/lifecycle.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/lifecycle.js)*

初步探索完了核心类的实现之后，接下来就要开始深入到Vue实现的具体功能部分了。在所有的功能开始运行之前，要来理解一下Vue的生命周期，在初始化函数中所有功能模块绑定到Vue的核心类上之前，最先开始执行了一个初始化生命周期的函数`initLifecycle(vm)`，先来看看这个函数做了些什么。


## 生命周期初始化属性

```js
// 导出initLifecycle函数，接受一个Component类型的vm参数
export function initLifecycle (vm: Component) {
  // 获取实例的$options属性，赋值为options变量
  const options = vm.$options

 // 找到最上层非抽象父级 
  // locate first non-abstract parent
  // 首先找到第一个父级
  let parent = options.parent
  // 判断是否存在且非抽象
  if (parent && !options.abstract) {
    // 遍历寻找最外层的非抽象父级
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 将实例添加到最外层非抽象父级的子组件中
    parent.$children.push(vm)
  }

  // 初始化实例的公共属性
  // 设置父级属性，如果之前的代码未找到父级，则vm.$parent为undefined
  vm.$parent = parent
  // 设置根属性，没有父级则为实例对象自身
  vm.$root = parent ? parent.$root : vm

  // 初始化$children和$refs属性
  // vm.$children是子组件的数组集合
  // vm.$refs是指定引用名称的组件对象集合
  vm.$children = []
  vm.$refs = {}

  // 初始化一些私有属性
  // 初始化watcher
  vm._watcher = null
  // _inactive和_directInactive是判断激活状态的属性
  vm._inactive = null
  vm._directInactive = false
  // 生命周期相关的私有属性
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}
```
`initLifecycle` 函数非常简单明了，主要是在生命周期开始之前设置一些相关的属性的初始值。一些属性将在之后的生命周期运行期间使用到。


## 生命周期初始化方法
生命周期的开始除了设置了相关属性的初始值之外，还为类原型对象挂载了一些方法，包括私有的更新组件的方法和公用的生命周期相关的方法。这些方法都包含在 `lifecycleMixin` 函数中，还记得这也是在定义核心类之后执行的那些函数之一，也来看看它的内容。

```js
// 导出lifecycleMixin函数，接收形参Vue，
// 使用Flow进行静态类型检查指定为Component类
export function lifecycleMixin (Vue: Class<Component>) {
  // 为Vue原型对象挂载_update私有方法
  // 接收vnode虚拟节点类型参数和一个可选的布尔值hydrating
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    // 定义实例变量
    const vm: Component = this
    
    // 下面三条赋值操作主要是为了存储旧属性
    // 实例的$el属性赋值给prevEl变量，实例挂载元素
    const prevEl = vm.$el
    // 实例的_vnode属性赋值给prevVnode变量，虚拟节点
    const prevVnode = vm._vnode
    // 将activeInstance赋值给prevActiveInstance变量，激活实例
    // activeInstance初始为null
    const prevActiveInstance = activeInstance

    // 下面是针对新属性的赋值
    // 将新实例设置为activeInstance
    activeInstance = vm
    // 将传入的vnode赋值给实例的_vnode属性
    // vnode是
    vm._vnode = vnode
    // 下面使用到的Vue.prototype .__ patch__方法是在运行时里注入的
    // 根据运行平台的不同定义
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    // 如果prevVnode属性不存在说明是新创建实例
    // 执行实例属性$el的初始化渲染，否则更新节点
    if (!prevVnode) {
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }

    // 将之前的激活实例又赋值给activeInstance
    activeInstance = prevActiveInstance
    // 更新__vue__属性的引用
    // update __vue__ reference
    // 如果存在旧元素则设置它的__vue__引用为null
    if (prevEl) {
      prevEl.__vue__ = null
    }
    // 如果实例的$el属性存在，设置它的__vue__引用为该实例
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // 如果父节点是一个高阶组件，也更新它的元素节点
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // 更新的钩子由调度器调用，以确保在父更新的钩子中更新子项。
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  // 为Vue实例挂载$forceUpdate方法，实现强制更新
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  // 为Vue实例挂载$destroy方法
  Vue.prototype.$destroy = function () {
    // 定义实例变量
    const vm: Component = this
    // 如果实例已经在销毁中，则返回
    if (vm._isBeingDestroyed) {
      return
    }
    // 调用beforeDestroy钩子
    callHook(vm, 'beforeDestroy')
    // 给实例设置正在销毁中的标志
    vm._isBeingDestroyed = true
    // 从父组件中移除自身
    // remove self from parent
    const parent = vm.$parent
    // 如果非抽象父级组件存在且没有在销毁中，则从父组件中移除实例
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // 销毁所有观察器
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // 移除对象引用
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // 调用最后的钩子
    // call the last hook...
    // 设置实例的已销毁标志
    vm._isDestroyed = true
    // 调用当前渲染树上的销毁钩子
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null)
    // 触发销毁钩子
    // fire destroyed hook
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    // 清除所有监听事件
    vm.$off()
    // 移除实例引用
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // 释放循环引用
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}
```
`lifecycleMixin` 函数实现了三个原型继承方法：
### 私有方法 _update
这个函数用于更新组件，实现数据和元素节点的无刷新更新，涉及到虚拟节点相关的一些内容，具体实现留给未来研究虚拟节点和数据更新时再深入探索。

### 公用方法 $forceUpdate
实现组件强制刷新，这个方法是从实例上设置的watcher对象方法中引用而来，在生命周期初始化的时候为实例设置了一个私有的_watcher属性，在观察者系统的功能模块中具体实现了这一对象，也放到以后在去深入了解。这里只要知道可以调用这个共有的API实现手动更新组件。

### 公用方法 $destroy
实例销毁方法。在刚开始讨论生命周期的开启时，就了解到了这个销毁Vue实例组件的方法，凡事都有始有终，从这里可以明白无误的认识到，Vue实例是一个生命过程。那么在Vue的生命过程中有哪些重要的阶段，是接下来要继续探索的内容。


## 生命周期过程

最明白无误的生命周期过程在官方文档中有介绍，这里再贴上这张经典的图示来做个纪念。

![生命周期图示](https://cn.vuejs.org/images/lifecycle.png)

### 生命周期钩子

在生命周期定义的各种方法中，整理出如下的生命周期钩子函数的调用
- callHook(vm, 'beforeCreate')
- callHook(vm, 'created')
- callHook(vm, 'beforeMount')
- callHook(vm, 'mounted')
- callHook(vm, 'beforeUpdate')
- callHook(vm, 'updated')
- callHook(vm, 'activated')
- callHook(vm, 'deactivated')
- callHook(vm, 'beforeDestroy')
- callHook(vm, 'destroyed')

---

之前看过很多次Vue的生命周期图，但在学习源码之前并没有特别深的感触，现在随着探索源码的深入，终于感觉到在慢慢了解这个过程的意义。整个生命周期的构建过程并不是最难的实现部分，但它是整个架构的背后支撑力量，有了生命周期的正常运转，才能一步步地实现接下来要学习的各种功能。