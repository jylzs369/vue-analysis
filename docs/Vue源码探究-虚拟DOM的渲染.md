# Vue源码探究-虚拟DOM的渲染

在[虚拟节点的实现](Vue源码探究-虚拟节点的实现.md)一篇中，除了知道了 `VNode` 类的实现之外，还简要地整理了一下DOM渲染的路径。在这一篇中，主要来分析一下两条路径的具体实现代码。

按照创建 `Vue` 实例后的一般执行流程，首先来看看实例初始化时对渲染模块的初始处理。这也是开始 `mount` 路径的前一步。初始包括两部分，一是向 `Vue` 类原型对象上挂载渲染相关的方法，而是初始化渲染相关的属性。

## 渲染的初始化

*下面代码位于[vue/src/core/instance/render.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/instance/render.js)*

### 相关属性初始化

```js
// 定义并导出initRender函数，接受vm
export function initRender (vm: Component) {
  // 初始化实例的根虚拟节点
  vm._vnode = null // the root of the child tree
  // 定义实例的静态树节点
  vm._staticTrees = null // v-once cached trees
  // 获取配置对象
  const options = vm.$options
  // 设置父占位符节点
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
  // renderContext存储父节点有无声明上下文
  const renderContext = parentVnode && parentVnode.context
  // 将子虚拟节点转换成格式化的对象结构存储在实例的$slots属性
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  // 初始化$scopedSlots属性为空对象
  vm.$scopedSlots = emptyObject

  // 为实例绑定渲染虚拟节点函数_c和$createElement
  // 内部实际调用createElement函数，并获得恰当的渲染上下文
  // 参数按顺序分别是：标签、数据、子节点、标准化类型、是否标准化标识
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize

  // 内部版本_c被从模板编译的渲染函数使用
  // internal version is used by render functions compiled from templates
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // 用户写的渲染函数会总是应用执行标准化的公共版本
  // normalization is always applied for the public version, used in
  // user-written render functions.
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // 为了更容易创建高阶组件，暴露了$attrs 和 $listeners
  // 并且需要保持属性的响应性以便能够实现更新，以下是对属性的响应处理
  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  // 对属性和事件监听器进行响应处理，建立观察状态
  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    // 在非生产环境时检测是否属于可读并发出警告
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`,  vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}
```

`initRender` 函数为实例进行了初始化处理，主要有三件事：
- 初始化相关属性
- 设置绑定了上下文的生成虚拟节点的私有和共有版函数
- 对节点的属性和事件监听器进行状态观察

生成虚拟节点函数主要会在流程中的 `render` 函数中使用。对节点属性和事件监听器的响应处理保证了在生命周期过程中节点属性和事件状态的更新。

### 挂载方法初始化

```js
// 导出renderMixin函数，接收形参Vue，
// 使用Flow进行静态类型检查指定为Component类
export function renderMixin (Vue: Class<Component>) {
  // 为Vue原型对象绑定运行时相关的辅助方法
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  // 挂载Vue原型对象的$nextTick方法，接收函数类型的fn形参
  Vue.prototype.$nextTick = function (fn: Function) {
    // 返回nextTick函数的执行结果
    return nextTick(fn, this)
  }
  // 挂载Vue原型对象的_render方法，期望返回虚拟节点对象
  // _render方法即是根据配置对象在内部生成虚拟节点的方法
  Vue.prototype._render = function (): VNode {
    // 将实例赋值给vm变量
    const vm: Component = this
    // 导入vm的$options对象的render方法和_parentVnode对象
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
    // 定义渲染节点
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

渲染模块挂载了两个方法 `$nextTick` 公共方法和 `_render` 私有方法`$nextTick` 是实例的公有方法，这个很常见，就不多说；`_render` 是内部用来生成 `VNode` 的方法，内部调用了 `initRender` 函数中绑定的 `createElement` 函数，初始化实例一般会调用实例的公共版方法，如果是创建组件则会调用私有版方法。

另 `renderMixin` 函数在执行时还为Vue实例绑定了一些处理渲染的工具函数，具体可查看[源代码](https://github.com/vuejs/vue/blob/v2.5.17-beta.0dev/src/core/instance/render-helpers/)。

## `mount` 路径的具体实现

按照创建Vue实例的一般流程，初始化处理好之后，最后一步执行的 `vm.$mount(vm.$options.el)` 就宣告 `mount` 渲染路径的开始。记得好像还没有见过 `$mount` 的实现，因为这个函数是在运行时挂在到原型对象上的，web端的源代码在[platforms/web](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/platforms/web/runtime/index.js)中。



## `update` 路径的具体实现