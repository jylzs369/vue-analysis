# Vue源码探究-类初始化函数详情

随着初始化函数的执行，实例的生命周期也开始运转，在初始化函数里可以看到每个模块向实例集成的功能，这些功能的具体内容以后在单独的文章里继续探索。现在来详细看看类初始化函数的详细代码。

## 类初始化函数的详情

### 头部引用
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
头部注入的一些方法是在生命周期运行中开始初始化的功能，之前在核心类实现的文章中有提到过，在这里不展开。`config`对象是作为基本的配置参数，在不同运行环境里会更改当中的属性值来适应不同的平台需求，在这个文件中只用到了其中的性能检测属性，与具体的类的实现没有太大关联，与引入的`mark`、`measure`方法配合主要是做性能评估用的。

在初始化组件的时候主要用到的是工具方法`extend`、`mergeOptions`、`formatComponentName`。

`extend`函数是一个很简单的为对象扩展属性的方法，代码位于这个文件中[vue/src/shared/util.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/shared/util.js)，具体实现太简单不用说了。
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
`mergeOptions`函数代码位于
[vue/src/core/util/options.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/util/options.js)中，为了看明白它在初始化函数里的用途，稍微看一下它的具体实现。
```js
/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    checkComponents(child)
  }

  if (typeof child === 'function') {
    child = child.options
  }

  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)
  const extendsFrom = child.extends
  if (extendsFrom) {
    parent = mergeOptions(parent, extendsFrom, vm)
  }
  if (child.mixins) {
    for (let i = 0, l = child.mixins.length; i < l; i++) {
      parent = mergeOptions(parent, child.mixins[i], vm)
    }
  }
  const options = {}
  let key
  for (key in parent) {
    mergeField(key)
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  function mergeField (key) {
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}
```


