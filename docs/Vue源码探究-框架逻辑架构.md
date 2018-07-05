# Vue源码探究-框架逻辑架构




### 生命周期
*下面代码位于[vue/src/core/instance/lifecycle.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/lifecycle.js)*
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

  // 为Vue实例挂载$forceUpdate方法，更新实例的属性
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  // 为Vue实例挂载$destroy方法
  Vue.prototype.$destroy = function () {】
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
