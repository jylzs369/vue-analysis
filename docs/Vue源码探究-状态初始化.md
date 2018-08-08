# Vue源码探究-状态初始化

*本篇代码位于[vue/src/core/instance/state.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/state.js)*

继续随着核心类的初始化展开探索其他的模块，这一篇来研究一下Vue的状态初始化。这里的状态初始化指的就是在创建实例的时候，在配置对象里定义的属性、数据变量、方法等是如何进行初始处理的。由于随后的数据更新变动都交给观察系统来负责，所以在事先弄明白了数据绑定的原理之后，就只需要将目光集中在这一部分。

下面来仔细看看在核心类中首先执行的关于 `state` 部分的源码：

## initState

```js
// 定义并导出initState函数，接收参数vm
export function initState (vm: Component) {
  // 初始化实例的私有属性_watchers
  // 这就是在观察系统里会使用到的存储所有显示监视器的对象
  vm._watchers = []
  // 获取实例的配置对象
  const opts = vm.$options
  // 如果定义了props，则初始化props
  if (opts.props) initProps(vm, opts.props)
  // 如果定义了methods，则初始化methods
  if (opts.methods) initMethods(vm, opts.methods)
  // 如果定义了data，则初始化data
  if (opts.data) {
    initData(vm)
  } else {
    // 否则初始化实例的私有属性_data为空对象，并开启观察
    observe(vm._data = {}, true /* asRootData */)
  }
  // 如果定义了computed，则初始化计算属性
  if (opts.computed) initComputed(vm, opts.computed)
  // 如果定义了watch并且不是nativeWatch，则初始化watch
  // nativeWatch是火狐浏览器下定义的对象的原型方法
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
```

这段代码非常直白，主要用来执行配置对象里定义的了状态的初始化。这里分别有 `props`、`data`、`methods`、`computed`、`watch`五个配置对象，分别有各自的初始化方法。接着来看看它们执行的详细代码。

### initProps

```js
// 定义initProps函数，接收vm，propsOptions两个参数
function initProps (vm: Component, propsOptions: Object) {
  // 赋值propsData，propsData是全局扩展传入的赋值对象
  // 在使用extend的时候会用到，实际开发里运用较少
  const propsData = vm.$options.propsData || {}
  // 定义实例的_props私有属性，并赋值给props
  const props = vm._props = {}
  // 缓存prop键，以便将来props更新可以使用Array而不是动态对象键枚举进行迭代。
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  // 是否是根实例
  const isRoot = !vm.$parent
  // 对于非根实例，关闭观察标识
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  // 遍历props配置对象
  for (const key in propsOptions) {
    // 向缓存键值数组中添加键名
    keys.push(key)
    // 验证prop的值，validateProp执行对初始化定义的props的类型检查和默认赋值
    // 如果有定义类型检查，布尔值没有默认值时会被赋予false，字符串默认undefined
    // 对propsOptions的比较也是在使用extend扩展时才有意义
    // 具体实现可以参考 src/core/util/props.js，没有难点这里不详细解释
    const value = validateProp(key, propsOptions, propsData, vm)

    // 非生产环境下进行检查和提示
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 进行键名的转换，将驼峰式转换成连字符式的键名
      const hyphenatedKey = hyphenate(key)
      // 对与保留变量名冲突的键名给予提示
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 对属性建立观察，并在直接使用属性时给予警告
      defineReactive(props, key, value, () => {
        if (vm.$parent && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 非生产环境下直接对属性进行存取器包装，建立依赖观察
      defineReactive(props, key, value)
    }
    // 使用Vue.extend()方法扩展属性时，已经对静态属性进行了代理
    // 这里只需要针对实例化时的属性执行代理操作
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 当实例上没有同名属性时，对属性进行代理操作
    // 将对键名的引用指向vm._props对象中
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  // 开启观察状态标识
  toggleObserving(true)
}
```

初始化 `props` 的过程中有针对extend方法会使用到的 `propsData` 属性的初始化。具体使用是在扩展对象时定义一些props，然后在创建实例的过程中传入propsData配置对象，扩展对象里相应的props属性会接收propsData传入的值。与在父组件传入props的值类似，只是这里要显式的通过 `propsData` 配置对象来传入值。

### initData

```js
function initData (vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}
```

### initComputed

```js

const computedWatcherOptions = { computed: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : userDef
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : userDef.get
      : noop
    sharedPropertyDefinition.set = userDef.set
      ? userDef.set
      : noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      watcher.depend()
      return watcher.evaluate()
    }
  }
}
```

### initMethods

```js

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (methods[key] == null) {
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}
```

### initWatch

```js
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}
```


## stateMixin

探索完了 `initState` 函数之后，继续来看看 `state` 混入的方法 `stateMixin`：

```js
// 定义并导出stateMixin函数，接收参数Vue
export function stateMixin (Vue: Class<Component>) {
  // 使用 Object.defineProperty 方法直接声明定义对象时，flow会发生问题
  // 所以必须在此程序化定义对象
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  // 定义dataDef对象
  const dataDef = {}
  // 定义dataDef的get方法，返回Vue实例私有属性_data
  dataDef.get = function () { return this._data }
  // 定义propsDef对象
  const propsDef = {}
  // 定义propsDef的get方法，返回Vue实例私有属性_props
  propsDef.get = function () { return this._props }
  // 非生产环境下，定义dataDef和propsDef的set方法
  if (process.env.NODE_ENV !== 'production') {
    // dataDef的set方法接收Object类型的newData形参
    dataDef.set = function (newData: Object) {
      // 提示避免传入对象覆盖属性$data
      // 推荐使用嵌套的数据属性代替
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    // 设置propsDef的set方法为只读
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 定义Vue原型对象公共属性$data，并赋值为dataDef
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  // 定义Vue原型对象公共属性$props，并赋值为propsDef
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 定义Vue原型对象的$set方法，并赋值为从观察者导入的set函数
  Vue.prototype.$set = set
  // 定义Vue原型对象的$delete方法，并赋值为从观察者导入的del函数
  Vue.prototype.$delete = del

  // 定义Vue原型对象的$watch方法
  // 接收字符串或函数类型的expOrFn，从命名中可看出希望为表达式或函数
  // 接收任何类型的cb，这里希望为回调函数或者是一个对象
  // 接收对象类型的options
  // 要求返回函数类型
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    // 把实例赋值给vm变量，类型需为Component
    const vm: Component = this
    // 如果cb是纯粹的对象类型
    if (isPlainObject(cb)) {
      // 返回createWatcher函数
      return createWatcher(vm, expOrFn, cb, options)
    }
    // 否则定义options
    options = options || {}
    // 定义options的user属性值为true
    options.user = true
    // 创建watcher实例
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 如果options的immediate为真
    if (options.immediate) {
      // 在vm上调用cb回调函数，并传入watcher.value作为参数
      cb.call(vm, watcher.value)
    }
    // 返回unwatchFn函数
    return function unwatchFn () {
      // 执行watcher.teardown()方法清除观察
      watcher.teardown()
    }
  }
}
```
stateMixin执行的是关于状态观察的一系列方法的混入，主要是三个方面：
- 定义实例$data和$props属性的存取器
- 定义实例的$set、$delete方法，具体实在定义在观察者模块中
- 定义实例的$watch方法

到这里，关于状态初始化的部分就探索完毕了，接下来要继续研究另一个与开发过程紧密关联的部分——模板的渲染。

---

状态初始化是与我们在开发的时候最息息相关的部分，在创建实例对象的配置对象中，我们设置了这些属性和方法，实例初始化的过程中对这些传入的配置进行了很多预先的处理，这就是状态初始化背后的逻辑。在探索到这一部分的时候才真正的感到，终于与平时的开发关联起来了。