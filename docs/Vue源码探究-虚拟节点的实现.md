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

最后来概括地描述一下 `VNode` 渲染成真实 `DOM` 的步骤：

## 渲染步骤

`Vue` 的渲染有两条路径：
- 组件实例初始创建生成DOM
- 组件数据更新刷新DOM

在研究生命周期的时候知道，有 `mount` 和 `update` 两个钩子函数，这两个生命周期的过程分别代表了两条渲染路径的执行。

### 组件实例初始创建生成DOM

`Vue` 组件实例初始创建时，走的是 `mount` 这条路径，在这条路径上初始是没有 `VNode` 的，要经历第一轮 `VNode` 的生成，所以在这种情况下，不需要进行与旧虚拟节点对象的比较，只需要直接创建虚拟节点树然后渲染成真实的 `DOM` 即可。这一段代码的实现是在[生命周期源码](https://github.com/vuejs/vue/blob/dev/src/core/instance/lifecycle.js)的 `mountComponent` 函数，在初次收集数据依赖创建监视器时，



### 组件数据更新刷新DOM

一般情况下，在对数据进行依赖收集并创建监视器的时候，会把待渲染的数据观察对象加入到事件任务队列中，避免开销过高在一次处理中集中执行。所以第一次