# Vue源码探究-虚拟节点的实现

页面初始化的所有状态都准备就绪之后，下一步就是要生成组件相应的虚拟节点—— `VNode`。初次进行组件初始化的时候，`VNode` 也会执行一次初始化并存储这时创建好的虚拟节点对象。在随后的生命周期中，组件内的数据发生变动时，会先生成新的 `VNode` 对象，然后再根据与之前存储的旧虚拟节点的对比来执行刷新页面 `DOM` 的操作。页面刷新的流程大致上可以这样简单的总结，但是其实现路程是非常复杂的，为了深入地了解虚拟节点生成和更新的过程，首先来看看 `VNode` 类的具体实现。

## VNode 类

`VNode` 类的实现是支持页面渲染的基础，这个类的实现并不复杂，但无论是创建Vue组件实例还是使用动态JS扩展函数组件都运用到了渲染函数 `render`，它充分利用了 `VNode` 来构建虚拟DOM树。

```js
// 定义并导出VNode类
export default class VNode {
  // 定义实例属性
  tag: string | void; // 标签名称
  data: VNodeData | void; // 节点数据
  children: ?Array<VNode>; // 子虚拟节点列表
  text: string | void; // 节点文字
  elm: Node | void; // 对应DOM节点
  ns: string | void; // 节点命名空间，针对svg标签的属性
  context: Component | void; // rendered in this component's scope // 组件上下文
  key: string | number | void;  // 节点唯一键
  componentOptions: VNodeComponentOptions | void; // 虚拟节点组件配置对象
  componentInstance: Component | void; // component instance // 组件实例
  parent: VNode | void; // component placeholder node // 组件占位符节点

  // 严格内部属性，有些属性是服务器渲染的情况使用的，暂时还不了解
  // strictly internal
  // 是否包含原始HTML。只有服务器端会使用
  raw: boolean; // contains raw HTML? (server only) 
  // 是否静态节点，静态节点将会被提升
  isStatic: boolean; // hoisted static node  
  // 是否在根节点插入，进入转换检查所必需的
  isRootInsert: boolean; // necessary for enter transition check
  // 是否空注释占位符
  isComment: boolean; // empty comment placeholder?
  // 是否拷贝节点
  isCloned: boolean; // is a cloned node?
  // 是否一次性节点
  isOnce: boolean; // is a v-once node?
  // 异步组件工厂方法
  asyncFactory: Function | void; // async component factory function
  // 异步源
  asyncMeta: Object | void;
  // 是否异步占位符
  isAsyncPlaceholder: boolean;
  // 服务器端上下文
  ssrContext: Object | void;
  // 功能节点的实际实例上下文
  fnContext: Component | void; // real context vm for functional nodes
  // 方法配置选项，只在服务器渲染使用
  fnOptions: ?ComponentOptions; // for SSR caching
  // 方法作用域id
  fnScopeId: ?string; // functional scope id support

  // 构造函数，参数均可选，与上面定义对应
  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {
    // 实例初始化赋值
    this.tag = tag
    this.data = data
    this.children = children
    this.text = text
    this.elm = elm
    this.ns = undefined
    this.context = context
    this.fnContext = undefined
    this.fnOptions = undefined
    this.fnScopeId = undefined
    this.key = data && data.key
    this.componentOptions = componentOptions
    this.componentInstance = undefined
    this.parent = undefined
    this.raw = false
    this.isStatic = false
    this.isRootInsert = true
    this.isComment = false
    this.isCloned = false
    this.isOnce = false
    this.asyncFactory = asyncFactory
    this.asyncMeta = undefined
    this.isAsyncPlaceholder = false
  }

  // 定义child属性的取值器
  // 已弃用：用于向后compat的componentInstance的别名
  // DEPRECATED: alias for componentInstance for backwards compat.
  /* istanbul ignore next */
  get child (): Component | void {
    return this.componentInstance
  }
}

// 定义并导出createEmptyVNode函数，创建空虚拟节点
export const createEmptyVNode = (text: string = '') => {
  // 实例化虚拟节点
  const node = new VNode()
  // 设置节点文字为空，并设置为注释节点
  node.text = text
  node.isComment = true
  // 返回节点
  return node
}

// 定义并导出createTextVNode函数，创建文字虚拟节点
export function createTextVNode (val: string | number) {
  // 置空实例初始化的标签名，数据，子节点属性，只传入文字
  return new VNode(undefined, undefined, undefined, String(val))
}

// 优化浅拷贝
// 用于静态节点和插槽节点，因为它们可以在多个渲染中重用，
// 当DOM操作依赖于它们的elm引用时，克隆它们可以避免错误
// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
// 定义并导出cloneVNode函数，拷贝节点
export function cloneVNode (vnode: VNode): VNode {
  // 拷贝节点并返回
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    vnode.children,
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  cloned.isCloned = true
  return cloned
}
```

`VNode` 类实现的源代码分两部分，第一部分是定义 `VNode` 类自身的实现，第二部分是定一些常用的节点创建方法，包括创建空的虚拟节点，文字虚拟节点和新拷贝节点。虚拟节点本身是一个包含了所有渲染所需信息的载体，从前面一部分的属性就可以看出，不仅有相应的 `DOM` 标签和属性信息，还包含了子虚拟节点列表，所以一个组件初始化之后得到的 `VNode` 也是一棵虚拟节点树，实质是抽象和信息化了的对应于 `DOM` 树的 `JS` 对象。 

`VNode` 的使用在服务器渲染中也有应用，关于这一部分暂时放到之后去研究。

认识到 `VNode` 的实质之后，对于它的基础性的作用还是不太清楚，为什么需要创建这种对象来呢？答案就在Vue的响应式刷新里。如前所述，观察系统实现了对数据变更的监视，在收到变更的通知之后处理权就移交到渲染系统手上，渲染系统首先进行的处理就是根据变动生成新虚拟节点树，然后再去对比旧的虚拟节点树，来实现这个抽象对象的更新，简单的来说就是通过新旧两个节点树的对照，来最终确定一个真实DOM建立起来所需要依赖的抽象对象，只要这个真实 `DOM` 所依赖的对象确定好，渲染函数会把它转化成真实的 `DOM` 树。

最后来概括地描述一下 `VNode` 渲染成真实 `DOM` 的路径：

## 渲染路径

`Vue` 的一般渲染有两条路径：
- 组件实例初始创建生成DOM
- 组件数据更新刷新DOM

在研究生命周期的时候知道，有 `mount` 和 `update` 两个钩子函数，这两个生命周期的过程分别代表了两条渲染路径的执行。

### 组件实例初始创建生成DOM

`Vue` 组件实例初始创建时，走的是 `mount` 这条路径，在这条路径上初始没有已暂存的旧虚拟节点，要经历第一轮 `VNode` 的生成。这一段代码的执行是从 `$mount` 函数开始的：

> **` $mount => mountComponent => updateComponent => _render => _update => createPatchFunction(patch) => createElm => insert => removeVnodes  `**

大致描述一下每一个流程中所进行的关于节点的处理：

- `mountComponent` 接收了挂载的真实DOM节点，然后赋值给 `vm.$el`
- `updateComponent` 调用 `_update`，并传入 `_render` 生成的新节点
- `_render` 生成新虚拟节点树，它内部是调用实例的 `createElement` 方法创建虚拟节点
- `_update` 方法接收到新的虚拟节点后，会根据是否已有存储的旧虚拟节点来分离执行路径，就这一个路径来说，初始储存的 `VNode` 是不存在的，接下来执行 `patch` 操作会传入挂载的真实DOM节点和新生成的虚拟节点。
- `createPatchFunction` 即是 `patch` 方法调用的实际函数，执行时会将传入的真实DOM节点转换成虚拟节点，然后执行 `createElm`
- `createElm` 会根据新的虚拟节点生成真实DOM节点，内部同样调用 `createElement` 方法来创建节点。
- `insert` 方法将生成的真实DOM插入到DOM树中
- `removeVnodes` 最后将之前转换的真实DOM节点从DOM树中移除

以上就是一般初始化Vue实例组件时渲染的路径，在这个过程中，初始 `VNode` 虽然不存在，但是由于挂在的真实 `DOM` 节点一定存在，所以代码会按照这样的流程来执行。

### 组件数据更新刷新DOM

一般情况下，数据变成会通知 `Watcher` 实例调用 `update` 方法，这个方法在一般情况下会把待渲染的数据观察对象加入到事件任务队列中，避免开销过高在一次处理中集中执行。所以在 `mount` 路径已经完成了之后，生命周期运行期间都是走的 `update` 路径，在每一次的事件处理中 `nextTick` 会调用 `flushSchedulerQueue` 来开始一轮页面刷新：

> **` flushSchedulerQueue => watcher.run => watcher.getAndInvoke => watcher.get  => updateComponent => _render => _update => createPatchFunction(patch) => patchVnode => updateChildren `**

在这个流程中各个方法的大致处理如下：

- `flushSchedulerQueue` 调用每一个变更了的数据的监视器的 `run` 方法
- `run` 执行调用实例的 `getAndInvoke` 方法，目的是获取新数据并调用监视器的回调函数
- `getAndInvoke` 执行的第一步是要获取变更后的新数据，在这时会调用取值器函数
- `get` 执行的取值器函数getter被设定为 `updateComponent`，所以会执行继续执行它
- `updateComponent` => `createPatchFunction` 之间的流程与另一条路径相同，只是其中基于新旧虚拟节点的判断不一样，如果存在旧虚拟节点就执行 `patchVnode` 操作。
- `patchVnode` 方法是实际更新节点的实现，在这个函数的执行中，会得到最终的真实DOM

生命周期中的渲染主要是以上两条路径，调用的入口不同，但中间有一部分逻辑是公用的，再根据判断来选择分离的路程来更新 `VNode` 和刷新节点。在这个过程可以看出 `VNode` 的重要作用。

虽然路径大致可以这样总结，但其中的实现比较复杂。不仅在流程判断上非常有跳跃性，实现更新真实节点树的操作也都是复杂递归的调用。

---

总的来说虚拟节点的实现是非常平易近人，但是在节点渲染的过程中却被运用的十分复杂，段位不够高看了很多遍测试了很多遍才弄清楚整个执行流，这之外还有关于服务器端渲染和持久活跃组件的部分暂时都忽略了。不过关于节点渲染这一部分的实现逻辑非常值得去好好研究。
