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
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    // 
    let isInitialPatch = false
    const insertedVnodeQueue = []

    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue)
    } else {
      const isRealElement = isDef(oldVnode.nodeType)
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly)
      } else {
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
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
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm)

        // create new node
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

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

        // destroy old node
        if (isDef(parentElm)) {
          removeVnodes(parentElm, [oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }

    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}
```

### `createElm`
```js 
function createElm (
  vnode,
  insertedVnodeQueue,
  parentElm,
  refElm,
  nested,
  ownerArray,
  index
) {
  if (isDef(vnode.elm) && isDef(ownerArray)) {
    // This vnode was used in a previous render!
    // now it's used as a new node, overwriting its elm would cause
    // potential patch errors down the road when it's used as an insertion
    // reference node. Instead, we clone the node on-demand before creating
    // associated DOM element for it.
    vnode = ownerArray[index] = cloneVNode(vnode)
  }

  vnode.isRootInsert = !nested // for transition enter check
  if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
    return
  }

  const data = vnode.data
  const children = vnode.children
  const tag = vnode.tag
  if (isDef(tag)) {
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

    vnode.elm = vnode.ns
      ? nodeOps.createElementNS(vnode.ns, tag)
      : nodeOps.createElement(tag, vnode)
    setScope(vnode)

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
    vnode.elm = nodeOps.createComment(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  } else {
    vnode.elm = nodeOps.createTextNode(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  }
}
```

创建了虚拟节点对应的DOM元素之后，就会调用 `insert` 方法将它插入到页面DOM树中，最后一步再调用 `removeVnodes` 方法移除掉DOM树中的旧节点。到此为止 `mount` 路径的执行就结束了。

## `update` 路径的具体实现