# Vue源码探究-全局API

*本篇代码位于[vue/src/core/global-api/](https://github.com/vuejs/vue/tree/v2.5.17-beta.0/src/core/global-api)*

Vue暴露了一些全局API来强化功能开发，API的使用示例官网上都有说明，无需多言。这里主要来看一下全局API模块的实现。全局API的文件夹里有一个入口文件，各个功能分开定义，在这个入口文件中统一注入。

## 入口文件index.js

```js
/* @flow */
// 从各个模块导入功能函数
import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'

// 导入内部辅助函数
import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

// 定义并导出initGlobalAPI函数
export function initGlobalAPI (Vue: GlobalAPI) {
  // 定义全局配置对象
  // config
  const configDef = {}
  // 定义配置对象的取值器函数
  configDef.get = () => config
  // 不允许在外部修改配置对象，非生产环境会给出警告
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  // 定义Vue类的静态属性config
  Object.defineProperty(Vue, 'config', configDef)

  // 暴露工具方法
  // exposed util methods.
  // 注意：这不是全局公共API的一部分，
  // 除非了解到它们会带来的风险否则请避免使用。
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // 定义Vue的静态方法set、delete、nextTick
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 初始化Vue.options属性为空对象
  Vue.options = Object.create(null)
  // 初始化options属性的各个子属性为空对象
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // 这用于标识“基础”构造函数
  // 以在Weex的多实例场景中扩展所有普通对象组件
  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  // 扩展options.components属性，加入内建组件
  extend(Vue.options.components, builtInComponents)

  // 向Vue类挂载静态方法
  initUse(Vue)
  initMixin(Vue)
  initExtend(Vue)
  initAssetRegisters(Vue)
}
```

入口文件从总体来讲可以分为两个部分：
- **定义静态属性**
  - `config`：在最开始的部分定义了Vue的静态属性 `config`，这是全局配置对象。
  - `options`：稍后定义的 `options` 对象是非常重要的属性，存放初始化的数据，我们平时在创建Vue实例时传入的配置对象最终要与这份配置属性合并，在实例初始化函数中的合并配置对象一部分可以初窥端倪。
- **定义静态方法**
  - `util`：虽然暴露了一些辅助方法，但官方并不将它们列入公共API中，不鼓励外部使用。
  - `set`：设置响应式对象的响应式属性，强制触发视图更新，在数组更新中非常实用，不适用于根数据属性。
  - `delete`：删除响应式属性强制触发视图更新， 使用情境较少。
  - `nextTick`：结束此轮循环后执行回调，常用于需要等待DOM更新或加载完成后执行的功能。
  - `use`：安装插件，自带规避重复安装。
  - `mixin`：常用于混入插件功能，不推荐在应用代码中使用。
  - `extend`：创建基于Vue的子类并扩展初始内容。
  - `directive`：注册全局指令。
  - `component`：注册全局组件。
  - `filter`：注册全局过滤器。

除了后6个方法之外，其他的辅助函数和方法都已经在其他模块里见识过了，继续来详细探索一下剩下的6个功能。`initAssetRegisters` 方法为Vue类注册的全局函数包括了 `directive`、`component`、`filter`，三个方法合在一个模块里，其余都分了各自的模块来定义。

## 全局API use

```js
// 导入toArray辅助函数
import { toArray } from '../util/index'

// 定义并导出initUse函数
export function initUse (Vue: GlobalAPI) {
  // 定义Vue类静态方法use，接受插件函数或对象
  Vue.use = function (plugin: Function | Object) {
    // 定义内部属性installedPlugins，存放已安装插件
    // 首次应用时定义为空数组
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 检测是否安装过传入的插件，已存在则返回
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // 处理附加参数，加入参数Vue
    // additional parameters
    // 将传入的参数转化为数组
    const args = toArray(arguments, 1)
    // 插入Vue类本身为第一个元素
    args.unshift(this)
    // 如果插件有install方法，则在plugin对象上调用并传入新参数
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      // 如果plugin本身是函数，则直接调用并传入新参数
      plugin.apply(null, args)
    }
    // 向缓存插件数组中添加此插件并返回
    installedPlugins.push(plugin)
    return this
  }
}
```

`use` 方法的实现很简单，在内部定义了数组来缓存已经注册过的插件，并在下一次注册前检验是否已注册过，可以避免重复注册插件。接受的参数值得注意，如果插件本身就是一个函数，则直接调用；如果插件是对象，则必须有install方法，否则没有任何行为，这是Vue为了统一插件定义规范所设置的入口方法名称。

## 全局API mixin

```js
// 导入mergeOptions辅助函数
import { mergeOptions } from '../util/index'

// 定义并导出initMixin函数
export function initMixin (Vue: GlobalAPI) {
  // 定义Vue的静态方法mixin
  Vue.mixin = function (mixin: Object) {
    // 合并配置对象，重置Vue类的静态属性options
    this.options = mergeOptions(this.options, mixin)
    // 返回
    return this
  }
}
```

`mixin` 方法的实现更加简洁，在重用Vue类的所有状态下，只是重新合并了options属性。由于使用场景大都是用来混入插件功能的，所以创建项目时几乎没有运用，了解即可。

## 全局API extend

```js
// 导入资源类型，模块方法和辅助方法
import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

// 定义并导出initExtend
export function initExtend (Vue: GlobalAPI) {
  // 每个实例构造函数，包括Vue都有唯一的cid。
  // 这使我们能够为原型继承创建包装的“子构造函数”并缓存它们。
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  // 设置Vue的cid为0
  Vue.cid = 0
  // 定义cid变量
  let cid = 1

  // 定义类继承方法
  /**
   * Class inheritance
   */
  // 定义Vue类静态方法extend，接受扩展选项对象
  Vue.extend = function (extendOptions: Object): Function {
    // extendOptions若未定义则设置为空对象
    extendOptions = extendOptions || {}
    // 存储父类和父类的cid
    const Super = this
    const SuperId = Super.cid
    // 定义缓存构造器对象，如果扩展选项的_Ctor属性未定义则赋值空对象
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    // 如果缓存构造器已存有该构造器，则直接返回
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 获取扩展配置对象名称或父级配置对象名称属性，赋值给name
    const name = extendOptions.name || Super.options.name
    // 在非生产环境下验证name是否合法并给出警告
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

    // 定义子类构造函数
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // 实现子类原型继承，原型指向父类原型，构造器指向Sub
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    // 定义子类cid，并递增cid
    Sub.cid = cid++
    // 定义子类options属性，合并配置对象
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    // 定义子类super属性，指向父类
    Sub['super'] = Super

    // 对于props和computed属性，扩展时在Vue实例上定义了代理getter。
    // 这避免了对每个创建的实例执行Object.defineProperty调用。
    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 初始化子类的props
    if (Sub.options.props) {
      initProps(Sub)
    }
    // 初始化子类的计算属性
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // 定义子类的全局API，扩展、混入和使用插件
    // allow further extension/mixin/plugin usage
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // 创建子类的资源注册方法，允许子类有私有资源
    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // 启用递归自查找
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // 在扩展时保持对父类配置对象的引用，
    // 以后实例化时可以检查父级配置对象是否更新
    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // 缓存子类构造函数
    // cache constructor
    cachedCtors[SuperId] = Sub
    // 返回
    return Sub
  }
}

// 定义初始化propss函数
function initProps (Comp) {
  // 获取配置对象的props属性
  const props = Comp.options.props
  // 设置代理
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

// 定义初始化计算属性函数
function initComputed (Comp) {
  // 获取配置对象的computed属性
  const computed = Comp.options.computed
  // 设置代理
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
```

`extend` 方法是最为复杂的全局API了，它在扩展类实现继承时进行了很多处理：除去判断是否有已存储的子类构造函数之外，首先是实现类继承，原理是原型式继承；然后为子类初始化props和computed属性的代理：最后是扩展全局API。另外对继承的父类的属性也进行了引用存储。

## 全局API 资源获取和注册
```js
// 导入资源类型和辅助函数
import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

// 定义并注册initAssetRegisters函数
export function initAssetRegisters (Vue: GlobalAPI) {
  // 创建资源注册方法
  /**
   * Create asset registration methods.
   */
  // 遍历ASSET_TYPES数组，为Vue定义相应方法
  // ASSET_TYPES包括了directive、 component、filter
  ASSET_TYPES.forEach(type => {
    // 定义资源注册方法，参数是标识名称id，和定义函数或对象
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      // 如果未传入definition，则视为获取该资源并返回
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        // 否则视为注册资源
        // 非生产环境下给出检验组件名称的错误警告
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        // 如果是注册component，并且definition是对象类型
        if (type === 'component' && isPlainObject(definition)) {
          // 设置definition.name属性
          definition.name = definition.name || id
          // 调用Vue.extend扩展定义，并重新赋值
          definition = this.options._base.extend(definition)
        }
        // 如果是注册directive且definition为函数
        if (type === 'directive' && typeof definition === 'function') {
          // 重新定义definition为格式化的对象
          definition = { bind: definition, update: definition }
        }
        // 存储资源并赋值
        this.options[type + 's'][id] = definition
        // 返回definition
        return definition
      }
    }
  })
}
```

`initAssetRegisters` 包含有三，分别是 `directive`、`component`、`filter` 的注册并获取方法。方法的作用视参数而定，只传入资源标识名称ID未传定义函数或对象，则视为获取资源方法，如果都传则是资源注册方法，可谓是非常js化的。比较重要的是这里对于 `definition` 参数的重赋值，根据资源的种类不同，会进行不同的处理：组件主要是扩展Vue类，指令是格式化成定义对象，方便之后对指令的统一处理。

---

全局API的细节大概就是以上这些，对于经常使用的方式，了解其具体实现可以帮助我们在应用时避免出现不必要的错误，对于不经常使用的方法，在探索其实现时可以学习它们的实现原理和良好的方式。重要是在实践中分清楚每一个方法的使用场景，选取最恰当的方式实现功能。
