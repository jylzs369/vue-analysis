# Vue源码探究-状态初始化

*本篇代码位于[vue/src/core/instance/state.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/core/instance/state.js)*

继续随着核心类的初始化展开探索其他的模块，这一篇来研究一下Vue的状态初始化。这里的状态初始化指的就是在创建实例的时候，在配置对象里定义的属性、数据变量、方法等是如何进行初始处理的。由于随后的数据更新变动都交给观察系统来负责，所以在事先弄明白了数据绑定的原理之后，就只需要将目光集中在这一部分。

来仔细看看在核心类中首先执行的关于 `state` 部分的源码：

## initState

```js
// 定义并导出initState函数，接收参数vm
export function initState (vm: Component) {
  // 初始化实例的私有属性_watchers
  // 这就是在观察系统里会使用到的存储所有显式监视器的对象
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

这段代码非常直白，主要用来执行配置对象里定义的了状态的初始化。这里分别有 `props`、`data`、`methods`、`computed`、`watch` 五个配置对象，分别有各自的初始化方法。在仔细研究它们的具体实现之前，先来看一段将在各个初始化函数里用到的辅助函数。

```js
// 定义共享属性定义描述符对象sharedPropertyDefinition
// 描述符对象的枚举和可配置属性都设置为true
// get、set方法设置为空函数
const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 定义并导出proxy函数，该函数用来为在目标对象上定义并代理属性
// 接收目标对象target，路径键名sourceKey，属性键名三个参数
export function proxy (target: Object, sourceKey: string, key: string) {
  // 设置属性描述符对象的get方法
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  // 设置属性描述性对象的set犯法
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  // 在目标对象上定义属性
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
```

`proxy` 函数的定义非常重要，在下面要探究的各个初始化函数中它，它会将我们在配置对象中设置的属性全部定义到实例对象中，但是我们对这些属性的操作是通过各部分相应的代理属性上来执行的。`get` 和 `set` 方法的实现非常明白的表示出这一过程，然后再将属性定义到实例中。由这个函数作为基础，继续来看看其他五个状态的初始化函数的内容。

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

`initProps` 函数的最主要内容有两点，一是对定义的数据建立观察，二是对数据进行代理，这就是私有变量 `_props` 的作用，之后获取和设置的变量都是作为 `_props` 的属性被操作。

另外初始化 `props` 的过程中有针对 `extend` 方法会使用到的 `propsData` 属性的初始化。具体使用是在扩展对象时定义一些 props，然后在创建实例的过程中传入  propsData 配置对象，扩展对象里相应的props属性会接收 propsData 传入的值。与在父组件传入 props 的值类似，只是这里要显式的通过 `propsData` 配置对象来传入值。

### initData

```js
// 定义initData函数
function initData (vm: Component) {
  // 获取配置对象的data属性
  let data = vm.$options.data
  // 判断data是否是函数
  // 若是函数则将getData函数的返回赋值给data和实例私有属性_data
  // 否则直接将data赋值给实例_data属性，并在无data时赋值空对象
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 如果data不是对象则将data赋值为空对象
  // 进一步保证data是对象类型
  if (!isPlainObject(data)) {
    data = {}
    // 在非生产环境下给出警告提示
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // 实例对象代理data
  // proxy data on instance
  // 获取所有data键值
  const keys = Object.keys(data)
  // 获取配置对象的props
  const props = vm.$options.props
  // 获取配置对象的methods
  const methods = vm.$options.methods
  // 遍历keys
  let i = keys.length
  while (i--) {
    const key = keys[i]
    // 非生产环境给出与methods定义的方法名冲突的警告
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    // 检测是否与props冲突
    if (props && hasOwn(props, key)) {
      // 非生产环境给出冲突警告
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    // 没有与props冲突并且非保留字时，代理键名到实例的_data对象上
    } else if (!isReserved(key)) {
      proxy(vm, `_data`, key)
    }
  }
  // 观察数据
  // observe data
  observe(data, true /* asRootData */)
}

// 定义并导出getData函数，接受函数类型的data对象，和Vue实例对象
export function getData (data: Function, vm: Component): any {
  // pushTarget和popTarget是为了解决Vue依赖性检测的缺陷可能导致冗余依赖性的问题
  // 具体可参阅 https://github.com/vuejs/vue/issues/7573
  // 此操作会设置Dep.target为undefined，在初始化option时调用dep.depend()也不会建立依赖
  // #7573 调用数据getter时禁用dep集合
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  // 尝试在vm上调用data函数并返回执行结果
  try {
    return data.call(vm, vm)
  } catch (e) {
    // 如果捕获到错误则处理错误，并返回空对象
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}
```

与 props 的处理类似，`initData` 函数的作用也是为了对数据建立观察的依赖关系，并且代理数据到私有变量 `_data` 上，另外包括了对 data 与其他配置对象属性的键名冲突的检测。

### initComputed

```js
// 设置computedWatcherOptions对象
const computedWatcherOptions = { computed: true }

// 定义initComputed函数，接受实例vm，和computed对象
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  // 定义watchers和实例_computedWatchers属性，初始赋值空对象
  const watchers = vm._computedWatchers = Object.create(null)
  // 是否是服务器渲染，computed属性在服务器渲染期间只能是getter
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  // 遍历computed
  for (const key in computed) {
    // 获取用户定义的值
    const userDef = computed[key]
    // 如果用户定义的是函数则赋值给getter否则j将userDef.get方法赋值给getter
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    // 非生产环境抛出缺少计算属性错误警告
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    // 非服务器渲染下
    if (!isSSR) {
      // 为计算属性创建内部监视器
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // 组件定义的内部计算属性已经在组件的原型上定义好了
    // 所以这里只要关注实例初始化时用户定义的计算属性
    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 键名非实例根属性时，定义计算属性，具体参照defineComputed函数
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    // 非生产环境下，检测与data属性名的冲突并给出警告
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// 定义并导出defineComputed哈数
// 接收实例target，计算属性键名key，计算属性值userDef参数
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 在非服务器渲染下设置缓存
  const shouldCache = !isServerRendering()
  // 计算属性值是函数时
  if (typeof userDef === 'function') {
    // 设置计算属性的getter，setter为空函数
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : userDef
    sharedPropertyDefinition.set = noop
  } else {
    // 当计算属性是对象时，设置计算属性的getter和setter
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : userDef.get
      : noop
    sharedPropertyDefinition.set = userDef.set
      ? userDef.set
      : noop
  }
  // 非生产环境下，如果没哟定义计算属性的setter
  // 想设置计算属性时给出警告
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 以重新设置的属性描述符为基础在实例对象上定义计算属性
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 定义createComputedGetter，创建计算属性getter
// 目的是在非服务器渲染情况下建立计算属性的观察依赖，
// 并根据其依赖属性返回计算后的值
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

计算属性的初始化相对复杂一些，首先要对计算属性建立观察，然后再在实例上重新定义计算属性，并且执行属性代理。由于加入了服务器渲染的功能，在定义计算属性的时候对使用环境做判断，是非服务器渲染会影响到计算属性的定义，这是由于服务器渲染下使用框架时，计算属性是不提供 setter 的；另外也要根据用户定义的值是函数或者对象来对计算属性重新定义 getter 和 setter。从这段代码里可以看出一个非常重要的程序，即在获取计算属性的时候才去计算它的值，这正是懒加载的实现。

### initMethods

```js
// 定义initMethods方法，接受实例vm，配置属性methods
function initMethods (vm: Component, methods: Object) {
  // 获取实例的props
  const props = vm.$options.props
  // 遍历methods对象
  for (const key in methods) {
    // 非生产环境下给出警告
    if (process.env.NODE_ENV !== 'production') {
      // 未赋值方法警告
      if (methods[key] == null) {
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      // 与props属性名冲突警告
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      // 与保留字冲突警告
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 在实例上定义方法，赋值为用户未定义函数或空函数
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}
```

`initMethods` 函数非常简单，除了一大段在非生产环境里报告检查冲突的代码，唯一的内容就是在实例上定义相应的方法并且把上下文绑定到实例对象上，这样即便不是使用箭头函数，在方法内也默认用 this 指代了实例对象。

### initWatch

```js
// 定义initWatch函数，接受实例vm和配置属性watch
function initWatch (vm: Component, watch: Object) {
  // 遍历watch
  for (const key in watch) {
    // 暂存属性的值
    const handler = watch[key]
    // 如果handler是数组
    if (Array.isArray(handler)) {
      // 遍历数组为每一个元素创建相应watcher
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      // 窦否则handler应该是函数，直接为key创建watcher
      createWatcher(vm, key, handler)
    }
  }
}

// 定义createWatcher函数
// 接受实例vm、表达式或函数expOrFn，处理器handler，可选的options
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 如果handler是对象
  if (isPlainObject(handler)) {
    // 将handler赋值给options.
    options = handler
    // 重新赋值handler
    handler = handler.handler
  }
  // 如果handler是字符串，在实例上寻找handler并赋值给handler
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  // 创建观察并返回
  return vm.$watch(expOrFn, handler, options)
}
```

`initWatcher` 为传入的观察对象创建监视器，比较简单。值得注意的是参数的传入类型，观察对象 `expOrFn` 可以有两种方式，一种是字符串，一种是函数，在 `Watcher` 类中对此参数进行了检测，而在初始化的函数里不对它做任何处理。`handler` 对象也可以接受对象或字符串类型，在代码中对这两种传入方式做判断，最终找到handler引用的函数传入 `$watch`。


## stateMixin

探索完了 `initState` 函数之后，继续来看看 `state` 混入的方法 `stateMixin`，在这个函数里会提供上面还未曾提到的 `$watch` 方法的具体实现：

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
    // 定义观察目标的options，大多数情况下为undefined
    options = options || {}
    // 定义options的user属性值为true，标识为用户定义
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
- 定义实例 $data 和 $props 属性的存取器
- 定义实例的 $set、$delete 方法，具体实在定义在观察者模块中
- 定义实例的 $watch 方法

到这里，关于状态初始化的部分就探索完毕了，接下来要继续研究另一个与开发过程紧密关联的部分——虚拟节点和模板渲染。

---

状态初始化是与我们在开发的时候最息息相关的部分，在创建实例对象的配置对象中，我们设置了这些属性和方法，实例初始化的过程中对这些传入的配置进行了很多预先的处理，这就是状态初始化背后的逻辑。在探索到这一部分的时候才真正的感到，终于与平时的开发关联起来了。