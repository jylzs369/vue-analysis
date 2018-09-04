# Vue源码探究-组件的持久活跃
*本篇代码位于[vue/src/core/components/keep-alive.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/components/keep-alive.js)

较新版本的Vue增加了一个内置组件 `keep-alive`，用于存储组件状态，即便失活也能保持现有状态不变，切换回来的时候不会恢复到初始状态。由此可知，路由切换的钩子所触发的事件处理是无法适用于 `keep-alive` 组件的，那如果需要根据失活与否来给予组件事件通知，该怎么办呢？如前篇所述，`keep-alive` 组件有两个特有的生命周期钩子 `activated` 和 `deactivated`，用来响应失活状态的事件处理。

来看看 `keep-alive` 组件的实现，代码文件位于 `components` 里，目前入口文件里也只有 `keep-alive` 这一个内置组件，但这个模块的分离，会不会预示着官方将在未来开发更多具有特殊功能的内置组件呢？

```js
// 导入辅助函数
import { isRegExp, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'

// 定义VNodeCache静态类型
// 它是一个包含key名和VNode键值对的对象，可想而知它是用来存储组件的
type VNodeCache = { [key: string]: ?VNode };

// 定义getComponentName函数，用于获取组件名称，传入组件配置对象
function getComponentName (opts: ?VNodeComponentOptions): ?string {
  // 先尝试获取配置对象中定义的name属性，或无则获取标签名称
  return opts && (opts.Ctor.options.name || opts.tag)
}

// 定义matches函数，进行模式匹配，传入匹配的模式类型数据和name属性
function matches (pattern: string | RegExp | Array<string>, name: string): boolean {
  // 匹配数组模式
  if (Array.isArray(pattern)) {
    // 使用数组方法查找name，返回结果
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    // 匹配字符串模式
    // 将字符串转换成数组查找name，返回结果
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    // 匹配正则表达式
    // 使用正则匹配name，返回结果
    return pattern.test(name)
  }
  /* istanbul ignore next */
  // 未匹配正确模式则返回false
  return false
}

// 定义pruneCache函数，修剪keep-alive组件缓存对象
// 接受keep-alive组件实例和过滤函数
function pruneCache (keepAliveInstance: any, filter: Function) {
  // 获取组件的cache，keys，_vnode属性
  const { cache, keys, _vnode } = keepAliveInstance
  // 遍历cache对象
  for (const key in cache) {
    // 获取缓存资源
    const cachedNode: ?VNode = cache[key]
    // 如果缓存资源存在
    if (cachedNode) {
      // 获取该资源的名称
      const name: ?string = getComponentName(cachedNode.componentOptions)
      // 当名称存在 且不匹配缓存过滤时
      if (name && !filter(name)) {
        // 执行修剪缓存资源操作
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

// 定义pruneCacheEntry函数，修剪缓存条目
// 接受keep-alive实例的缓存对象和键名缓存对象，资源键名和当前资源
function pruneCacheEntry (
  cache: VNodeCache,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  // 检查缓存对象里是否已经有以key值存储的资源
  const cached = cache[key]
  // 如果有旧资源并且没有传入新资源参数或新旧资源标签不同
  if (cached && (!current || cached.tag !== current.tag)) {
    // 销毁该资源
    cached.componentInstance.$destroy()
  }
  // 置空key键名存储资源
  cache[key] = null
  // 移除key值的存储
  remove(keys, key)
}

// 定义模式匹配接收的数据类型
const patternTypes: Array<Function> = [String, RegExp, Array]

// 导出keep-alive组件实例的配置对象
export default {
  // 定义组件名称
  name: 'keep-alive',
  // 设置abstract属性
  abstract: true,
  // 设置组件接收的属性
  props: {
    // include用于包含模式匹配的资源，启用缓存
    include: patternTypes,
    // exclude用于排除模式匹配的资源，不启用缓存
    exclude: patternTypes,
    // 最大缓存数
    max: [String, Number]
  },

  created () {
    // 实例创建时定义cache属性为空对象，用于存储资源
    this.cache = Object.create(null)
    // 设置keys数组，用于存储资源的key名
    this.keys = []
  },

  destroyed () {
    // 实例销毁时一并销毁存储的资源并清空缓存对象
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted () {
    // DOM加载完成后，观察include和exclude属性的变动
    // 回调执行修改缓存对象的操作
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  render () {
    // 实例渲染函数
    // 获取keep-alive包含的子组件结构
    // keep-alive组件并不渲染任何真实DOM节点，只渲染嵌套在其中的组件资源
    const slot = this.$slots.default
    // 将嵌套组件dom结构转化成虚拟节点
    const vnode: VNode = getFirstComponentChild(slot)
    // 获取嵌套组件的配置对象
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    // 如果配置对象存在
    if (componentOptions) {
      // 检查是否缓存的模式匹配
      // check pattern
      // 获取嵌套组件名称
      const name: ?string = getComponentName(componentOptions)
      // 获取传入keep-alive组件的include和exclude属性
      const { include, exclude } = this
      // 如果有included，且该组件不匹配included中资源
      // 或者有exclude。且该组件匹配exclude中的资源
      // 则返回虚拟节点，不继续执行缓存
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      // 获取keep-alive组件的cache和keys对象
      const { cache, keys } = this
      // 获取嵌套组件虚拟节点的key
      const key: ?string = vnode.key == null
        // 同样的构造函数可能被注册为不同的本地组件，所以cid不是判断的充分条件
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      // 如果缓存对象里有以key值存储的组件资源
      if (cache[key]) {
        // 设置当前嵌套组件虚拟节点的componentInstance属性
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        // 从keys中移除旧key，添加新key
        remove(keys, key)
        keys.push(key)
      } else {
        // 缓存中没有该资源，则直接存储资源，并存储key值
        cache[key] = vnode
        keys.push(key)
        // 如果设置了最大缓存资源数，从最开始的序号开始删除存储资源
        // prune oldest entry
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }

      // 设置该资源虚拟节点的keepAlive标识
      vnode.data.keepAlive = true
    }
    // 返回虚拟节点或dom节点
    return vnode || (slot && slot[0])
  }
}
```
`keep-alive` 组件的实现也就这百来行代码，分为两部分：第一部分是定义一些处理具体实现的函数，比如修剪缓存对象存储资源的函数，匹配组件包含和过滤存储的函数；第二部分是导出一份 `keep-alive` 组件的应用配置对象，仔细一下这跟我们在实际中使用的方式是一样的，但这个组件具有已经定义好的特殊功能
，就是缓存嵌套在它之中的组件资源，实现持久活跃。

那么实现原理是什么，在代码里可以清楚得看到，这里是利用转换组件真实DOM节点为虚拟节点将其存储到 `keep-alive` 实例的 `cache` 对象中，另外也一并存储了资源的 `key` 值方便查找，然后在渲染时检测其是否符合缓存条件再进行渲染。`keep-alive` 的实现就是以上这样简单。

---

最初一瞥此段代码时，不知所云。然而当开始逐步分析代码之后，才发现原来只是没有仔细去看，误以为很深奥，由此可见，任何不用心的行为都不能直抵事物的本质，这是借由探索这一小部分代码而得到的教训。因为在实际中有使用过这个功能，所以体会更深，有时候难免会踩到一些坑，看了源码的实现之后，发现原来是自己使用方式不对，所以了解所用轮子的实现还是很有必要的。
