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

按照创建Vue实例的一般流程，初始化处理好之后，最后一步执行的 `vm.$mount(vm.$options.el)` 就宣告 `mount` 渲染路径的开始。记得好像还没有见过 `$mount` 的定义，因为这个函数是在运行时挂在到原型对象上的，web端的源代码在 [platforms/web](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/platforms/web/runtime/index.js) 中，同样要值得注意的是原型的 `__patch__` 方法也是在运行时定义的。代码片段如下所示：

```js
// install platform patch function
Vue.prototype.__patch__ = inBrowser ? patch : noop

// public mount method
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}
```

虽然这两个方法都是在运行时才定义，但各自都是引用了核心代码中定义的实际实现函数：`mountComponent` 和 `patch`，下面就按照执行的流程一步步来解析这些实现渲染功能的函数。

### `mountComponent`

源代码位于[core/instance/lifecycle.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/instance/lifecycle.js)中。

```js
// 定义并导出mountComponent函数
// 接受Vue实例vm，DOM元素el、布尔标识hydrating参数
// 后两参数可选，返回组件实例
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  // 设置实例的$el属性
  vm.$el = el
  // 检测实例属性$options对象的render方法，未定义则设置为创建空节点
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode
    // 非生产环境检测构建版本并警告
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 调用生命周期钩子函数beforeMount，准备首次加载
  callHook(vm, 'beforeMount')

  // 定义updateComponent方法
  let updateComponent
  // 非生产环境加入性能评估
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    // 定义updateComponent内部调用实例的_update方法
    // 参数为按实例状态生成的新虚拟节点树和hydrating标识
    updateComponent = () => {
      vm._update(vm._render(), hydrating)
    }
  }

  // 在Watcher类内部将此监听器设置到实例的_watcher上。
  // 由于初次patch可能调用$forceUpdate方法（例如在子组件的mounted钩子），
  // 这依赖于已经定义好的vm._watcher
  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 建立对渲染的观察，最末参数声明为渲染监听器，并传入监视器的before方法，
  // 在初次渲染之后，实例的_isMounted为true，在每次渲染更新之前会调用update钩子
  new Watcher(vm, updateComponent, noop, {
    before () {
      if (vm._isMounted) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  // 设置hydrating标识为false
  hydrating = false

  // 手动安装的实例，mounted调用挂载在自身
  // 渲染创建的子组件在其插入的钩子中调用了mounted
  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  // vm.$vnode为空设置_isMounted属性为true，并调用mounted钩子
  // vm.$vnode为空是因为实例是根组件，没有父级节点。
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  // 返回实例
  return vm
}
```

### `updateComponent`

`updateComponent` 函数在上一流程中定义，在执行过程中传入为待观察属性创建的监视器中，并在首次渲染时被调用。可以在上述代码中看出，其内部是执行了实例的 `_update` 方法，并传入实例 `_render` 方法的执行结果和 `hydrating` 参数，`hydrating` 似乎是与服务器端渲染有关的标识属性，暂时不太清楚具体的作用。

### `_render`

在文首的 `renderMixin` 函数中定义，返回虚拟节点作为传入下一流程 `_update` 的第一个参数。

### `_update`

在前文[生命周期](Vue源码探究-生命周期.md)中的 `lifecycleMixin` 函数中定义，正是在这个方法中，发生了执行路径的分流，在 `mount` 路径中，执行首次渲染分支，将挂载的DOM元素和 `_render` 首次生成的虚拟节点传入 `patch` 函数中。

### `patch`

`patch` 方法定义在 [platforms/web/runtime/patch.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/platforms/web/runtime/patch.js)中：

```js
export const patch: Function = createPatchFunction({ nodeOps, modules })
```

从最后一句代码可以看出，`patch` 得到的是 `createPatchFunction` 执行后内部返回的 `patch` 函数，传入的是平台特有的参数。在 `createPatchFunction` 函数执行过程中定义了一系列闭包函数来实现最终的DOM渲染，具体代码非常多，简单解释一下其内部定义的各种函数的用途，最后详细探索一下 `patch` 函数的具体实现。

```js
// 定义并导出createPatchFunction函数，接受backend参数
// backend参数是一个含有平台相关BOM操作的对象方法集
export function createPatchFunction (backend) {

  // 创建空虚拟节点函数
  function emptyNodeAt (elm) {}

  // 创建移除DOM节点回调
  function createRmCb (childElm, listeners) {}

  // 移除DOM节点
  function removeNode (el) {}

  // 判断是否是未知元素
  function isUnknownElement (vnode, inVPre) {}

  // 创建并插入DOM元素
  function createElm (
    vnode,
    insertedVnodeQueue,
    parentElm,
    refElm,
    nested,
    ownerArray,
    index
  ) {}

  // 初始化组件
  function initComponent (vnode, insertedVnodeQueue) {}

  // 激活组件
  function reactivateComponent (vnode, insertedVnodeQueue, parentElm, refElm) {}

  // 插入DOM节点
  function insert (parent, elm, ref) {}

  // 创建子DOM节点
  function createChildren (vnode, children, insertedVnodeQueue) {}

  // 判断节点是否可对比更新
  function isPatchable (vnode) {}

  // 调用创建钩子
  function invokeCreateHooks (vnode, insertedVnodeQueue) {}

  // 为组件作用域CSS设置范围id属性。
  // 这是作为一种特殊情况实现的，以避免通过正常的属性修补过程的开销。
  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  // 设置CSS作用域ID
  function setScope (vnode) {}

  // 添加虚拟节点，内部调用createElm
  function addVnodes () {}

  // 调用销毁钩子
  function invokeDestroyHook (vnode) {}

  // 移除虚拟节点，内部调用removeNode或removeAndInvokeRemoveHook
  function removeVnodes (parentElm, vnodes, startIdx, endIdx) {}

  // 调用移除事件回调函数并移除节点
  function removeAndInvokeRemoveHook (vnode, rm) {}

  // 更新子节点
  function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {}

  // 检查重复key
  function checkDuplicateKeys (children) {}

  // 寻找旧子节点索引
  function findIdxInOld (node, oldCh, start, end) {}

  // 对比并更新虚拟节点
  function patchVnode (oldVnode, vnode, insertedVnodeQueue, removeOnly) {}

  // 调用插入钩子
  function invokeInsertHook (vnode, queue, initial) {}

  // 渲染混合
  // 注意：这是一个仅限浏览器的函数，因此我们可以假设elms是DOM节点。
  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  function hydrate (elm, vnode, insertedVnodeQueue, inVPre) {}

  // 判断节点匹配
  function assertNodeMatch (node, vnode, inVPre) {}

  // 节点补丁函数
  // 接受旧新虚拟节点，hydrating和removeOnly标识
  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    // 如果新虚拟节点未定义且存在旧节点，则调用销毁节点操作并返回
    // 这一步的判断是因为在旧虚拟节点存时，变动后没有生成新虚拟节点
    // 则说明新结构是不存在的，所以要清空旧节点。
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    // 初始化isInitialPatch标识和insertedVnodeQueue队列
    let isInitialPatch = false
    const insertedVnodeQueue = []

    // 以下分两种情况构建节点：
    // 如果不存在旧虚拟节点
    if (isUndef(oldVnode)) {
      // 空挂载（比如组件），会创建新的根元素
      // empty mount (likely as component), create new root element
      // 这种情况说明时首次渲染，设置isInitialPatch为true
      isInitialPatch = true
      // 根据虚拟节点创建新DOM节点
      createElm(vnode, insertedVnodeQueue)
    } else {
      // 存在旧虚拟节点
      // 判断旧虚拟节点是否是真实的DOM元素
      const isRealElement = isDef(oldVnode.nodeType)
      // 如果不是真实DOM节点并且新旧虚拟节点根节点相同
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // 执行比较新旧节点更新DOM操作
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly)
      } else {
        // 新旧节点不相同的情况
        // 旧节点是DOM元素时先将旧节点转换成虚拟节点
        if (isRealElement) {
          // 挂在到真实DOM元素
          // 检查是否是服务器渲染，然后执行合并操作
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          // 下面这两个if语句里的操作都是服务器渲染相关，暂不去了解
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              )
            }
          }
          // 如果不是服务器渲染或合并失败，生成空的虚拟节点
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          oldVnode = emptyNodeAt(oldVnode)
        }

        // 定义旧元素oldElm和其父元素
        // replacing existing element
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm)

        // 根据新虚拟节点创建新DOM元素，并且会插入到DOM树中
        // create new node
        createElm(
          vnode,
          insertedVnodeQueue,
          // 以下参数是#4590问题的解决处理
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // 如果新的虚拟节点有父级则以递归方式更新父占位符节点元素
        // cbs是在生成patch函数时初始化好的事件监听器
        // 在此条件中也会被逐一触发
        // update parent placeholder node element, recursively
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent
          const patchable = isPatchable(vnode)
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            ancestor.elm = vnode.elm
            if (patchable) {
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } else {
              registerRef(ancestor)
            }
            ancestor = ancestor.parent
          }
        }

        // 销毁旧节点
        // destroy old node
        // 如果旧节点的父级元素存在，则从其上移除旧节点
        if (isDef(parentElm)) {
          removeVnodes(parentElm, [oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          // 否则视为不存在旧DOM节点，此时如果虚拟节点有标签名
          // 则调用旧虚拟节点销毁钩子
          invokeDestroyHook(oldVnode)
        }
      }
    }

    // 最后调用新节点的插入钩子
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    // 返回虚拟节点的真实DOM元素
    return vnode.elm
  }
}
```

`createPatchFunction` 函数内容非常多，但大多数函数都是辅助性的，与节点处理和回调函数钩子相关。大致上了解作用即可。

`patch` 方法的执行首先分了两条路线：
- 不存在旧虚拟节点直接创建新节点插入到DOM树，这是首次渲染的执行路径，这种情况简单。
- 存在旧虚拟节点时需进行对比再更新，这种情况比较复杂，其中又要分旧节点是否是真实DOM的情况，是虚拟节点并且与新生成虚拟节点相等（这里的相等是指同样的虚拟根节点，具体可参照sameVnode的代码查看条件）则直接进行对比更新；若是真实节点要先进行到虚拟节点的转换还有与服务器渲染相关的判断，然后再根据得到的结果创建新的DOM节点插入页面，最后还要分情况进行父节点的递归更新和移除旧节点。

`patch` 方法的实现方式是有迹可循的，在这源代码中，可以看出之前划分的 `mount` 和 `update` 的执行流程，但要注意的是，上述的条件判断划分的路线和逻辑上划分的流程是稍有区别的，`mount` 路径其实在代码里体现为 `!oldVnode` 和 `oldVnode` 路线中是真实DOM元素的情况，跨越了两个条件，主要体现在直接调用了 `createElm` 创建并插入新节点，这是因为在渲染时分为有无声明挂载的真实DOM元素两种情况。而 `update` 直接进入的是 `patchVnode` 对比操作。虽然有点绕但是需要分清楚这种区别。然而具体如何实现节点的创建和对比更新还是得继续往里层看，由于这一条路径是讲 `mount` 情况，所以往下先看看与之接续的 `createElm` 函数。

### `createElm`

```js 
// 定义createElm函数，一系列参数主要记住vnode，parentElm
function createElm (
  vnode,
  insertedVnodeQueue,
  parentElm,
  refElm,
  nested,
  ownerArray,
  index
) {
  // 如果新虚拟节点存在真实DOM元素和ownerArray，
  // 则代表它在之前的渲染中用过。
  // 现在要被用作新节点时有潜在的错误
  // 所以将它改为从本身克隆的节点
  if (isDef(vnode.elm) && isDef(ownerArray)) {
    // This vnode was used in a previous render!
    // now it's used as a new node, overwriting its elm would cause
    // potential patch errors down the road when it's used as an insertion
    // reference node. Instead, we clone the node on-demand before creating
    // associated DOM element for it.
    vnode = ownerArray[index] = cloneVNode(vnode)
  }

  // 设置isRootInsert，为检查过度动画入口
  vnode.isRootInsert = !nested // for transition enter check
  // 下面判断用于keep-alive组件，若是普通组件则会返回undefined继续往下执行
  if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
    return
  }

  // 获取虚拟节点信息、子节点和标签名称
  const data = vnode.data
  const children = vnode.children
  const tag = vnode.tag
  // 下面三种情况创建普通节点、注释节点和文字节点
  if (isDef(tag)) {
    // 具有标签名称，则创建普通节点
    // 非生产环境简则是否是正确的元素
    if (process.env.NODE_ENV !== 'production') {
      if (data && data.pre) {
        creatingElmInVPre++
      }
      if (isUnknownElement(vnode, creatingElmInVPre)) {
        warn(
          'Unknown custom element: <' + tag + '> - did you ' +
          'register the component correctly? For recursive components, ' +
          'make sure to provide the "name" option.',
          vnode.context
        )
      }
    }

    // 根据ns属性选择创建节点的方式创建节点
    vnode.elm = vnode.ns
      ? nodeOps.createElementNS(vnode.ns, tag)
      : nodeOps.createElement(tag, vnode)
    // 设置节点的作用域ID
    setScope(vnode)

    // 如果是weex平台，可以根据参数调整节点树插入DOM的具体实现
    /* istanbul ignore if */
    if (__WEEX__) {
      // in Weex, the default insertion order is parent-first.
      // List items can be optimized to use children-first insertion
      // with append="tree".
      const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
      if (!appendAsTree) {
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        insert(parentElm, vnode.elm, refElm)
      }
      createChildren(vnode, children, insertedVnodeQueue)
      if (appendAsTree) {
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        insert(parentElm, vnode.elm, refElm)
      }
    } else {
      // web平台则先创建子节点插入父级后再一次插入DOM中
      createChildren(vnode, children, insertedVnodeQueue)
      if (isDef(data)) {
        invokeCreateHooks(vnode, insertedVnodeQueue)
      }
      insert(parentElm, vnode.elm, refElm)
    }

    if (process.env.NODE_ENV !== 'production' && data && data.pre) {
      creatingElmInVPre--
    }
  } else if (isTrue(vnode.isComment)) {
    // 如果是注释节点，则创建注释节点并插入到DOM中
    vnode.elm = nodeOps.createComment(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  } else {
    // 如果是文字节点，则创建文字节点并插入到DOM
    vnode.elm = nodeOps.createTextNode(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  }
}
```

`createElm` 函数包含了节点的创建和插入两部分，创建了虚拟节点对应的DOM元素之后，就会调用 `insert` 方法将它插入到页面DOM结构中。创建功能在这里遵循DOM的三种节点类型，即元素、注释和文字节点，实际与插入和移除方法一样都是使用了对应的原生方法 ，`nodeops` 对象即是在返回 `patch` 函数时预先导入了的原生DOM操作方法的集合，具体可以在[运行时的处理](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/platforms/web/runtime/node-ops.js)中确认。之前生成的 `vnode` 决定了最终应该生成何种节点，在这个函数中就能够发现，最终生成的真实DOM节点是多么依赖于 `vnode` 所携带的信息，所以说虚拟节点是实现生成真实DOM的基础。

这个流程中最后一步再调用 `removeVnodes` 方法移除掉DOM树中的旧节点，到此为止 `mount` 路径的执行就结束了。

## `update` 路径的具体实现

根据 `update` 的执行流程，前一部分是由 `watcher` 来响应的，就不再讨论，然后进入 `updateComponent` 流程，直至返回 `patch` 函数都与 `mount` 流程的实现一致，只是要执行不同的分支，整个流程中只有最后一步生成真实DOM的过程有所区别，就是 `patchVnode` 函数的执行。上面已经说过 `update` 流程中最后是要对比新旧节点然后再实现更新，这个功能即由 `patchVnode` 来完成，它的内部调用 `updateChildren` 来完成对比，实现逻辑非常有借鉴性，值得玩味。下面来看看这两个函数， 

### patchVnode

```js
// 定义patchVnode函数，接收四个参数
function patchVnode (oldVnode, vnode, insertedVnodeQueue, removeOnly) {
  // 如果新旧虚拟节点相同则结束对比
  if (oldVnode === vnode) {
    return
  }

  // 获取并设置新虚拟节点的真实DOM元素
  const elm = vnode.elm = oldVnode.elm

  // 异步占位符节点的特殊处理
  if (isTrue(oldVnode.isAsyncPlaceholder)) {
    if (isDef(vnode.asyncFactory.resolved)) {
      hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
    } else {
      vnode.isAsyncPlaceholder = true
    }
    return
  }

  // 为静态树重用元素
  // 只在克隆虚拟节点时使用，如非克隆节点则需要重新渲染
  // reuse element for static trees.
  // note we only do this if the vnode is cloned -
  // if the new node is not cloned it means the render functions have been
  // reset by the hot-reload-api and we need to do a proper re-render.
  if (isTrue(vnode.isStatic) &&
    isTrue(oldVnode.isStatic) &&
    vnode.key === oldVnode.key &&
    (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
  ) {
    vnode.componentInstance = oldVnode.componentInstance
    return
  }

  // 如果存在内联预处理钩子则调用
  let i
  const data = vnode.data
  if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
    i(oldVnode, vnode)
  }

  // 下面是对一般情况的DOM更新处理
  // 获取虚拟节点子节点
  const oldCh = oldVnode.children
  const ch = vnode.children
  // 如果存在更新钩子则调用
  if (isDef(data) && isPatchable(vnode)) {
    for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
    if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
  }
  // 当新虚拟节点不存在text属性值，即不是文字节点时
  if (isUndef(vnode.text)) {
    // 情况一：新旧虚拟节点子节点都存在时
    if (isDef(oldCh) && isDef(ch)) {
      // 不相等则更新子节点树
      if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
    } else if (isDef(ch)) {
      // 情况二，只有新虚拟节点子节点存在，
      // 旧虚拟节点是文字节点，先置空元素文本内容
      if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
      // 再向DOM元素插入新虚拟节点内容
      addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
    } else if (isDef(oldCh)) {
      // 情况三，只有旧虚拟节点子节点存在，则移除DOM元素内容
      removeVnodes(elm, oldCh, 0, oldCh.length - 1)
    } else if (isDef(oldVnode.text)) {
      // 情况四，新旧虚拟节点子节点不存在且旧虚拟节点是文字节点
      // 置空DOM元素文本内容
      nodeOps.setTextContent(elm, '')
    }
  } else if (oldVnode.text !== vnode.text) {
    // 新虚拟节点是文字节点时，除非旧节点也是文字节点且内容相等
    // 直接将新文本内容设置到DOM元素中
    nodeOps.setTextContent(elm, vnode.text)
  }
  // 如果存在后处理钩子则调用
  if (isDef(data)) {
    if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
  }
}
```

`patchVnode` 的内容主要有三点，第一是处理异步虚拟节点；第二是处理静态可重用元素；第三是处理一般情况下的新旧节点更新。

一般情况下的新旧节点更新首先是按照新虚拟节点是否文字节点来分情况，因为DOM的更新决定权在于新的虚拟节点内容，如果是新节点是文字节点，则可以不用在意旧节点的情况，除非旧节点也是文本内容且内容无异时不需要处理，其他情况下都直接为DOM元素内容重置为新虚拟节点的文本。如果新节点不是文字节点，处理会再细分为四种情况：第一是新旧虚拟子节点都存在且不相等时，执行patch核心的更新操作 `updateChildren`。第二是只有新子节点存在而旧子节点不存在，如果旧节点是文字节点，先要置空就节点的文本内容，再向DOM元素添加新字节点的内容。第三是只有旧子节点存在而新子节点不存在时，说明更新后没有节点了，执行移除操作。第四是新旧子节点不存在而旧节点是文字节点时，清空DOM元素的文本内容。

这里要十分注意理清虚拟节点和其子节点的比较。只有当新旧虚拟节点与其各自子虚拟节点都存储的是元素节点时，才需要调用 `updateChildren` 函数来进行深入比较，其他的情况都可以比较简便的处理DOM节点的更新，这也避免了不必要的处理提高了渲染的性能。

最后来看看整个DOM节点对比更新的核心逻辑函数：

### updateChildren

```js
// 定义updateChildren函数，接受5个参数
function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
  // 初始化逻辑需要的变量，由于此函数仅针对子节点，所以以下省略“子”字
  let oldStartIdx = 0 // 旧节点开始索引
  let newStartIdx = 0 // 新节点开始索引
  let oldEndIdx = oldCh.length - 1 // 旧节点结束索引
  let oldStartVnode = oldCh[0] // 当前旧首节点
  let oldEndVnode = oldCh[oldEndIdx] // 当前旧尾节点
  let newEndIdx = newCh.length - 1 // 新节点结束索引
  let newStartVnode = newCh[0] // 当前新首节点
  let newEndVnode = newCh[newEndIdx] // 当前新尾节点
  let oldKeyToIdx, idxInOld, vnodeToMove, refElm

  // removeOnly是仅用于<transition-group>情况下的特殊标识，
  // 确保移除的元素在离开过渡期间保持在正确的相对位置。
  // removeOnly is a special flag used only by <transition-group>
  // to ensure removed elements stay in correct relative positions
  // during leaving transitions
  const canMove = !removeOnly

  // 检查新节点中有无重复key
  if (process.env.NODE_ENV !== 'production') {
    checkDuplicateKeys(newCh)
  }

  // 以增加索引值模拟移动指针，逐一对比对应索引位置的节点
  // 循环仅在在新旧开始索引同时小于各自结束索引时才继续进行
  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    // 对比具体分为7种情况：
    if (isUndef(oldStartVnode)) {
      // 当前旧首节点不存在时，递增旧开始索引指向后一节点
      oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
    } else if (isUndef(oldEndVnode)) {
      // 当前旧尾节点不存在时，递减旧结束索引指向前一节点
      oldEndVnode = oldCh[--oldEndIdx]
    } else if (sameVnode(oldStartVnode, newStartVnode)) {
      // 当前新旧首节点相同，递归调用patchVnode对比子级
      patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
      // 递增新旧开始索引，当前新旧节点指向各自后一节点
      oldStartVnode = oldCh[++oldStartIdx]
      newStartVnode = newCh[++newStartIdx]
    } else if (sameVnode(oldEndVnode, newEndVnode)) {
      // 当前新旧尾节点相同，递归调用patchVnode对比子级
      patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
      // 递减新旧结束索引，当前新旧尾节点指向前一节点
      oldEndVnode = oldCh[--oldEndIdx]
      newEndVnode = newCh[--newEndIdx]
    } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
      // 当前旧首节点与当前新尾节点相同，递归调用patchVnode对比
      patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
      // canMove为真则将当前旧首节点移动到下一兄弟节点前
      canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
      // 递增就开始索引，当前旧首节点指向后一节点
      oldStartVnode = oldCh[++oldStartIdx]
      // 递减新结束索引，当前新尾节点指向前一节点
      newEndVnode = newCh[--newEndIdx]
    } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
      // 当前旧尾节点与当前新首节点相同，调用patchVnode
      patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
      // canMove为真则将当前旧尾节点移动到当前旧首节点前
      canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
      // 递减旧节点结束索引，当前旧尾节点指向前一节点
      oldEndVnode = oldCh[--oldEndIdx]
      // 递增新节点开始索引，当前新首节点指向后一节点
      newStartVnode = newCh[++newStartIdx]
    } else {
      // 其他情况下
      // oldKeyToIdx未定义时根据旧节点创建key和索引键值对集合
      if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
      // 如果当前新首节点的key存在，则idxInOld等于oldKeyToIdx中对应key的索引
      // 否则寻找旧节点数组中与当前新首节点相同的节点索引赋予idxInOld
      idxInOld = isDef(newStartVnode.key)
        ? oldKeyToIdx[newStartVnode.key]
        : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
      //  如果idxInOld不存在，则说明当前对比的新节点是新增节点
      if (isUndef(idxInOld)) { // New element
        // 创建新节点插入到父级对应位置
        createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
      } else {
        // 在旧节点数组中找到了相应的节点的索引时
        // 将vnodeToMove赋值为相应的节点
        vnodeToMove = oldCh[idxInOld]
        // 对比此节点和当前新首节点
        if (sameVnode(vnodeToMove, newStartVnode)) {
          // 如果相同，则继续对比子级
          patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue)
          // 将旧节点数组中的该节点设置为undefined
          oldCh[idxInOld] = undefined
          // 移动找到的节点到当前旧首节点之前
          canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
        } else {
          // 如不同，则说明虽然key相同，但是不同元素，当作新元素处理
          // same key but different element. treat as new element
          // 创建新元素闯入父级相应位置
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        }
      }
      // 递增新节点开始索引，当前新首节点指向下一节点
      newStartVnode = newCh[++newStartIdx]
    }
  }
  // 新旧节点开始索引任一方大于其结束索引时结束循环
  // 当旧节点开始索引大于旧节点结束索引时
  if (oldStartIdx > oldEndIdx) {
    // 判断新节点数组中newEndIdx索引后的节点是否存在，若不存在refElm为null
    // 若存在则refElm为相应节点的elm值
    refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
    // 向父节点相应位置添加该节点
    addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
  } else if (newStartIdx > newEndIdx) {
    // 当新节点开始索引大于新节点结束索引时
    // 在父级中移除未处理的剩余旧节点，范围是oldStartIdx~oldEndIdx
    removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
  }
}
```

`updateChildren` 函数的主要逻辑是利用索引来替换当前节点的引用，有如模拟指针移动指向的对象，来逐一进行对比，并且是递归进行的。指针移动的基准是参照新节点，条件满足下，根据当前的新节点来寻找旧节点中对应的节点，如果相等会递归进入子级，如果不相等当作新增节点处理，在处理之后会移动到下一个节点，继续新一轮的对比。在旧节点数组中将对比过的节点设置成 `undefined` 标志节点已处理过，避免了以后的多余对比。这里的处理逻辑是相当巧妙的，这就是节点对比更新的最基础的实现。

---

终于把我认为Vue最核心的另一个主要功能给攻略了下来，真是激动人心。比起数据绑定，这一部分的实现也着实不简单，光是处理流就让人凌乱不堪。`patch` 所实际对应的 `createPatchFunction` 函数是这一模块的重中之重，理顺了更新渲染的流程，继而理解了这一函数的具体实现后，基本上能对Vue的渲染功能有了一定深度的把握。