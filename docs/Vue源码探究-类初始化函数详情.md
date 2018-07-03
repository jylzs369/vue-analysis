# Vue源码探究-类初始化函数详情

随着初始化函数的执行，实例的生命周期也开始运转，在初始化函数里可以看到每个模块向实例集成的功能，这些功能的具体内容以后在单独的文章里继续探索。现在来详细看看类初始化函数的详细代码。

## 头部引用
*下面代码位于[vue/src/core/instance/init.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/instance/init.js)

```js
import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'
```
头部注入的一些方法是在生命周期运行中开始初始化的功能，之前在核心类实现的文章中有提到过，在这里不展开。`config`对象是作为基本的配置参数，在不同运行环境里会更改当中的属性值来适应不同的平台需求，在这个文件中只用到了其中的性能检测属性，与具体的类的实现没有太大关联，与引入的`mark`、`measure`、`formatComponentName`方法配合主要是做性能评估用的。

在初始化组件的时候主要用到的是工具方法`extend`、`mergeOptions`。

### 辅助函数extend
`extend`函数是一个很简单的为对象扩展属性的方法，代码位于这个文件中[vue/src/shared/util.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/shared/util.js)，具体实现非常基础，看看就好。
```js
/**
 * Mix properties into target object.
 */
export function extend (to: Object, _from: ?Object): Object {
  for (const key in _from) {
    to[key] = _from[key]
  }
  return to
}
```

### 辅助函数mergeOptions
`mergeOptions`函数代码位于
[vue/src/core/util/options.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/util/options.js)中，它是初始化合并options对象时非常重要的函数，为了看明白它在初始化函数里的用途，稍微花点时间来仔细看一下它的具体实现。
```js
// 该函数用于将两个配置对象合并为一个新的配置对象，
// 核心实体既用于实例化也用于继承
/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
// 导出mergeOptions函数
// 接收Object类型的parent、child参数，Component类型的vm参数
// 函数返回对象
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  // 非生产环境时检查child对象的components属性中是否有不合适的引用组件名称
  // 不合适的组建名主要是指与Vue内建html标签或保留标签名相同的组件名称如slot,component
  // 有兴趣了解的可以参照同一文件中的L246到L269查看具体实现
  // 其中的辅助工具函数位于src/shared/util.js的L94到L112
  if (process.env.NODE_ENV !== 'production') {
    checkComponents(child)
  }

  // 如果child传入的是函数对象，则将函数的options属性赋值给child，确保child引用options
  if (typeof child === 'function') {
    child = child.options
  }

  // 下面三个函数都是将child的各个属性格式化成预定好的对象格式
  // 标准化属性
  normalizeProps(child, vm)
  // 标准化注入
  normalizeInject(child, vm)
  // 标准化指令
  normalizeDirectives(child)
  // 定义扩展
  const extendsFrom = child.extends
  // 如果存在则向下递归合并
  if (extendsFrom) {
    parent = mergeOptions(parent, extendsFrom, vm)
  }
  // 如果存在mixins，则合并每一个mixin对象
  if (child.mixins) {
    for (let i = 0, l = child.mixins.length; i < l; i++) {
      parent = mergeOptions(parent, child.mixins[i], vm)
    }
  }
  // 定义以空对象options
  const options = {}
  let key
  // 对每一个parent中的属性进行合并，添加到options中
  for (key in parent) {
    mergeField(key)
  }
  // 如果parent中不含有key属性，则对每一个child中key属性进行合并
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  // 定义mergeField函数，接收key参数
  function mergeField (key) {
    // 如果strats[key]有定义好的合并策略函数，则复制给strat
    // 否则将默认的defaultStrat方法赋给strat
    const strat = strats[key] || defaultStrat
    // 合并属性
    options[key] = strat(parent[key], child[key], vm, key)
  }
  // 返回最终options对象
  return options
}
```

尽管 `mergeOptions` 函数的实现有些复杂，但它的作用其实比较明确，就是解决初始化的过程中对继承的类的options对象和新传入的options对象之间同名属性的冲突，即使用继承的属性值还是新传入的属性值的问题。在代码的一开始官方就已说明它是一个递归函数，可以一并解决添加了扩展内容和使用了mixins的场景，总而言之，这个步骤就是确保我们初始化的实例的options对象正确唯一。

代码中有几个标准化属性的函数，具体实现也在以上代码的同一文件中，虽然有一堆代码，但实现还是比较简单，主要目的就是把传入的options对象的各个属性格式化成基于对象的预定格式，在以后的运行中方便使用。

`hasOwn` 函数是对 `Object.prototype.hasOwnProperty` 方法的一个包装，比较简单，需要了解的话就去[util工具函数文件](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/shared/util.js)中查看。

值得一提的是 `strats` 的使用。在代码的一开始的部分就定义 `strats` 变量，并说明它是用来处理父子选项合并属性的功能。
```js
/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies
```

对于 `el` 和 `propsData` 属性的合并策略赋予 `defaultStrat` 函数，该函数的原则是child对象属性优先，没有child对象属性则返回parent的对应属性。

```js
/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}
```

`data`、`watch`、`props`、`methods`、`inject`、`computed`、`provide `、各种钩子函数和`ASSET_TYPES`里包含的`component`、`directive` 、 `filter` 三个属性都分别定义了相关的合并方法，有兴趣继续了解的同学可以在同一分文件中查看，代码太长但是实现比较基础，所以没什么好详说的，可以关注一下的是某些属性是替换覆盖，而某些属性是合并成数组如各种钩子的监听函数。 

## 初始化内部组件时options的合并
对于初始化合并options的操作分为了两个方向，一是创建内部组件时的合并，二是创建非内部组件实例时的合并，先来说说内部组件初始化的详细内容，在类的实现中对应着这一句代码 `initInternalComponent(vm, options)`
 ```js
 // 输出initInternalComponent函数
 // 接受Component类型的vm参数和InternalComponentOptions类型的options参数
 // 这里vm和options分别是创建实例时将要传入的实例对象和配置对象
 export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 定义opts，为opts和vm.$options创建以vm.constructor.options为原型的对象
  const opts = vm.$options = Object.create(vm.constructor.options)
  // 以下为手动赋值，目的为了提升性能，因为比通过动态枚举属性来赋值的过程快
  // doing this because it's faster than dynamic enumeration.
  // 定义父虚拟节点parentVnode并赋值
  const parentVnode = options._parentVnode
  // 设置opts对象parent和_parentVnode属性
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  // 定义vnodeComponentOptions并赋值
  const vnodeComponentOptions = parentVnode.componentOptions
  // 定义opts各属性
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  // options.render属性存在，则设置opts的render和staticRenderFns属性
  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}
```
可以看出 `initInternalComponent` 函数的内容比较简单，主要是为创建的内部组件的options对象手动赋值，提升性能，因为按照官方注释的说法是所有的内部组件的初始化都没有列外可以同样处理。至于什么时候会创建内部组件，这种场景目前还不太了解，能确定的是通常创建Vue实例来初始化视图页面的用法是非内部组件性质的。在这里留下一个疑问。


## 初始化实例时options的合并
下面三个函数就是初始化实例合并options这条线时用到的方法，后两个函数作辅助用。对应如下带代码。主要是用来解决构造函数的默认配置选项和扩展选项之间的合并问题。

```js
vm.$options = mergeOptions(
  resolveConstructorOptions(vm.constructor),
  options || {},
  vm
)
```

```js
// 导出resolveConstructorOptions函数，接受Component构造函数Ctor参数
export function resolveConstructorOptions (Ctor: Class<Component>) {
  // 定义传入的构造函数的options属性
  let options = Ctor.options
  // 如果Ctor.super存在则执行下面代码，这里是用来判断实例对象是否有继承
  // 如果有的话递归的把继承的父级对象的options都拿出来合并
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // 如果父级的option变化了则要更新
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // 检查是否有任何后期修改/附加选项，这是为了解决之前误删注入选项的问题
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // 如果返回有修改的选项，则扩展Ctor.extendOptions
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 合并继承选项和扩展选项
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      // 设置options.components[options.name]的引用
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  // 返回options
  return options
}

// 以下两个函数是为了解决#4976问题的方案
// 定义resolveModifiedOptions函数，接受Ctor参数，返回Object
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  // 定义modified变量储存最终要选择保留的属性
  let modified
  // 分别定义最新、扩展和密封的配置选项
  const latest = Ctor.options
  const extended = Ctor.extendOptions
  const sealed = Ctor.sealedOptions
  // 遍历传入的配置选项对象
  for (const key in latest) {
    // 如果最新的属性与密封的属性不相等，则执行去重处理
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = dedupe(latest[key], extended[key], sealed[key])
    }
  }
  // 返回modified
  return modified
}

// 定义dedupe函数，接收latest最新对象，extended扩展对象，sealed密封对象
function dedupe (latest, extended, sealed) {
  // 合并选项的时候比较最新和密封的属性，确保生命周期钩子不重复
  // compare latest and sealed to ensure lifecycle hooks won't be duplicated
  // between merges
  // 如果latest是数组
  if (Array.isArray(latest)) {
    // 定义res变量
    const res = []
    // 格式化sealed和extended为数组对象
    sealed = Array.isArray(sealed) ? sealed : [sealed]
    extended = Array.isArray(extended) ? extended : [extended]
    for (let i = 0; i < latest.length; i++) {
      // 返回扩展的选项中存在的最新对象的属性而非密封选项以排除重复选项
      // push original options and not sealed options to exclude duplicated options
      if (extended.indexOf(latest[i]) >= 0 || sealed.indexOf(latest[i]) < 0) {
        res.push(latest[i])
      }
    }
    // 返回包含了扩展选项的数组变量
    return res
  } else {
    // 否则直接返回latest
    return latest
  }
}
```
使用 `resolveConstructorOptions` 函数解决了继承的构造函数的选项之后，新创建的实例vm的$options对象就是继承选项和创建时传入的options选项的合并。其中虽然有很多复杂的递归调用，但是这些函数的目的都是为了确定最终的选项，理解这个目的非常重要。

---

初始化函数的执行不仅在于开始生命周期的运行，对于options对象的各个属性值如何取舍的问题给出了非常复杂但健全的解决方法，这为生命周期正常运行铺垫了非常坚实的基础，有了清晰的options选项，之后的功能才能如期顺利执行。在这里也可以看出Vue处理各种属性的合并原则，对此有良好的理解可以确保在使用时立即定位遇到的相关问题。