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
[vue/src/core/util/options.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/util/options.js)中，为了看明白它在初始化函数里的用途，稍微花点时间来仔细看一下它的具体实现。
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
  // 
  let key
  for (key in parent) {
    mergeField(key)
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  // 定义mergeField函数
  function mergeField (key) {
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}
```

