# Vue源码探究-数据绑定的实现

*本篇代码位于[vue/src/core/observer/](https://github.com/vuejs/vue/tree/v2.5.17-beta.0/src/core/observer)*

在总结完[数据绑定实现的逻辑架构](Vue源码探究-数据绑定逻辑架构.md)一篇后，已经对Vue的数据观察系统的角色和各自的功能有了比较透彻的了解，这一篇继续仔细分析下源码的具体实现。

## Observer

```js
// Observer类用来附加到每个观察对象上。
// 将被观察目标对象的属性键名转换成存取器,
// 以此收集依赖和派发更新
/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
 // 定义并导出 Observer 类
export class Observer {
  // 初始化观测对象，依赖对象，实例计数器三个实例属性
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that has this object as root $data

  // 构造函数接受被观测对象参数
  constructor (value: any) {
    // 将传入的观测对象赋予实例的value属性
    this.value = value
    // 创建新的Dep依赖对象实例赋予dep属性
    this.dep = new Dep()
    // 初始化实例的vmCount为0
    this.vmCount = 0
    // 将实例挂载到观测对象的'__ob__‘属性上
    def(value, '__ob__', this)
    // 如果观测对象是数组
    if (Array.isArray(value)) {
      // 判断是否可以使用__proto__属性，以此甚至augment含糊
      const augment = hasProto
        ? protoAugment
        : copyAugment
      // 拦截原型对象并重新添加数组原型方法
      // 这里应该是为了修复包装存取器破坏了数组对象的原型继承方法的问题
      augment(value, arrayMethods, arrayKeys)
      // 观察数组中的对象
      this.observeArray(value)
    } else {
      // 遍历每一个对象属性转换成包装后的存取器
      this.walk(value)
    }
  }

  // walk方法用来遍历对象的每一个属性，并转化成存取器
  // 只在观测值是对象的情况下调用
  /**
   * Walk through each property and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      // 将每一个对象属性转换成存取器
      defineReactive(obj, keys[i])
    }
  }

  // 观察数组对象
  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    // 遍历每一个数组对象，并继续观察
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// 下面是两个辅助函数，用来根据是否可以使用对象的 __proto__属性来拦截原型
// 函数比较简单，不详细解释了
// helpers

/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

// observe函数用来为观测值创建观察目标实例
// 如果成功被观察则返回观察目标，或返回已存在观察目标
/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
 // 定义并导出observe函数，接受观测值和是否作为data的根属性两个参数
 // 返回Observer类型对象或空值
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 判断是否为所要求的对象，否则不继续执行
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  // 定义Observer类型或空值的ob变量
  let ob: Observer | void
  // 如果观测值具有__ob__属性，并且其值是Observer实例，将其赋予ob
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    // 如果shouldObserve为真，且不是服务器渲染，观测值是数组或者对象
    // 观测值可扩展，且观测值不是Vue实例，则创建新的观察目标实例赋予ob
    // 这里发现了在Vue核心类创建实例的时候设置的_isVue的用途了
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  // 如果asRootData为真且ob对象存在，ob.vmCount自增
  if (asRootData && ob) {
    ob.vmCount++
  }
  // 返回ob
  return ob
}

// defineReactive函数用来为观测值包赚存取器
/**
 * Define a reactive property on an Object.
 */
// 定义并导出defineReactive函数，接受参数观测源obj，属性key, 值val,
// 自定义setter方法customSetter，是否进行递归转换shallow五个参数
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 创建依赖对象实例
  const dep = new Dep()

  // 获取obj的属性描述符
  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 如果该属性不可配置则不继续执行
  if (property && property.configurable === false) {
    return
  }
  // 提供预定义的存取器函数
  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  // 如果不存在getter或存在settter，且函数只传入2个参数，手动设置val值
  // 这里主要是Obserber的walk方法里使用的情况，只传入两个参数
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }
  // 判断是否递归观察子对象，并将子对象属性都转换成存取器，返回子观察目标
  let childOb = !shallow && observe(val)
  // 重新定义属性
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // 设置getter
    get: function reactiveGetter () {
      // 如果预定义的getter存在则value等于getter调用的返回值
      // 否则直接赋予属性值
      const value = getter ? getter.call(obj) : val
      // 如果存在当前依赖目标，即监视器对象，则建立依赖
      if (Dep.target) {
        dep.depend()
        // 如果子观察目标存在，建立子对象的依赖关系
        if (childOb) {
          childOb.dep.depend()
          // 如果属性是数组，则特殊处理收集数组对象依赖
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      // 返回属性值
      return value
    },
    // 设置setter，接收新值newVal参数
    set: function reactiveSetter (newVal) {
      // 如果预定义的getter存在则value等于getter调用的返回值
      // 否则直接赋予属性值
      const value = getter ? getter.call(obj) : val
      // 如果新值等于旧值或者新值旧值为null则不执行
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      // 非生产环境下如果customSetter存在，则调用customSetter
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // 如果预定义setter存在则调用，否则直接更新新值
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 判断是否递归观察子对象并返回子观察目标
      childOb = !shallow && observe(newVal)
      // 发布变更通知
      dep.notify()
    }
  })
}


// 下面是单独定义并导出的动态增减属性时观测的函数
// set函数用来对程序执行中动态添加的属性进行观察并转换存取器，不详细解释
/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

// Delete函数用来对程序执行中动态删除的属性发布变更通知，不详细解释
/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

// 特殊处理数组的依赖收集的函数，递归的对数组中的成员执行依赖收集
/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
```


## Dep

```js
let uid = 0

// dep是个可观察对象，可以有多个指令订阅它
/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
// 定义并导出Dep类
export default class Dep {
  // 定义变量
  // 私有变量，当前评估watcher对象
  static target: ?Watcher;
  // dep实例Id
  id: number;
  // dep实例监视器/订阅者数组
  subs: Array<Watcher>;

  // 定义构造器
  constructor () {
    // 初始化时赋予递增的id
    this.id = uid++
    this.subs = []
  }

  // 定义addSub方法，接受Watcher类型的sub参数
  addSub (sub: Watcher) {
    // 向subs数组里添加新的watcher
    this.subs.push(sub)
  }

  // 定义removeSub方法，接受Watcher类型的sub参数
  removeSub (sub: Watcher) {
    // 从subs数组里移除指定watcher
    remove(this.subs, sub)
  }

  // 定义depend方法，将观察对象和watcher建立依赖
  depend () {
    // 在创建Wacther的时候会将在创建的Watcher赋值给Dep.target
    // 建立依赖时如果存在Watcher，则会调用Watcher的addDep方法
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  // 定义notify方法，通知更新
  notify () {
    // 调用每个订阅者的update方法实现更新
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// Dep.target用来存放目前正在评估的watcher
// 全局唯一，并且一次也只能有一个watcher被评估
// the current target watcher being evaluated.
// this is globally unique because there could be only one
// watcher being evaluated at any time.
Dep.target = null
// targetStack用来存放watcher栈
const targetStack = []

// 定义并导出pushTarget函数，接受Watcher类型的参数
export function pushTarget (_target: ?Watcher) {
  // 入栈并将当前watcher赋值给Dep.target
  if (Dep.target) targetStack.push(Dep.target)
  Dep.target = _target
}

// 定义并导出popTarget函数
export function popTarget () {
  // 出栈操作
  Dep.target = targetStack.pop()
}
```

## Watcher

````js
let uid = 0

// watcher用来解析表达式，收集依赖对象，并在表达式的值变动时执行回调函数
// 全局的$watch()方法和指令都以同样方式实现
/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
// 定义并导出Watcher类
export default class Watcher {
  // 定义变量
  vm: Component; // 实例
  expression: string; // 表达式
  cb: Function; // 回调函数
  id: number; // watcher实例Id
  deep: boolean; // 是否深层依赖
  user: boolean; // 是否用户定义
  computed: boolean; // 是否计算属性
  sync: boolean; // 是否同步
  dirty: boolean;  // 是否为脏监视器
  active: boolean; // 是否激活中
  dep: Dep; // 依赖对象
  deps: Array<Dep>; // 依赖对象数组
  newDeps: Array<Dep>; // 新依赖对象数组
  depIds: SimpleSet;  // 依赖id集合
  newDepIds: SimpleSet; // 新依赖id集合
  before: ?Function; // 先行调用函数
  getter: Function; // 指定getter
  value: any; // 观察值

  // 定义构造函数
  // 接收vue实例，表达式对象，回调函数，配置对象，是否渲染监视器5个参数
  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    // 下面是对实例属性的赋值
    this.vm = vm
    // 如果是渲染监视器则将它赋值给实例的_watcher属性
    if (isRenderWatcher) {
      vm._watcher = this
    }
    // 添加到vm._watchers数组中
    vm._watchers.push(this)
    // 如果配置对象存在，初始化一些配置属性
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.computed = !!options.computed
      this.sync = !!options.sync
      this.before = options.before
    } else {
      // 否则将配属性设为false
      this.deep = this.user = this.computed = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.computed // for computed watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // 设置监视器的getter方法
    // parse expression for getter
    // 如果传入的expOrFn参数是函数直接赋值给getter属性
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 否则解析传入的表达式的路径，返回最后一级数据对象
      // 这里是支持使用点符号获取属性的表达式来获取嵌套需观测数据
      this.getter = parsePath(expOrFn)
      // 不存在getter则设置空函数
      if (!this.getter) {
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 如果是计算属性，创建dep属性
    if (this.computed) {
      this.value = undefined
      // 
      this.dep = new Dep()
    } else {
      // 负责调用get方法获取观测值
      this.value = this.get()
    }
  }

  // 评估getter，并重新收集依赖项
  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 将实例添加到watcher栈中
    pushTarget(this)
    let value
    const vm = this.vm
    // 尝试调用vm的getter方法
    try {
      value = this.getter.call(vm, vm)
    } catch (e) {
      // 捕捉到错误时，如果是用户定义的watcher则处理异常
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        // 否则抛出异常
        throw e
      }
    } finally {
      // 最终执行“触摸”每个属性的操作，以便将它们全部跟踪为深度监视的依赖关系
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        // traverse方法递归每一个对象，将对象的每级属性收集为深度依赖项
        traverse(value)
      }
      // 执行出栈
      popTarget()
      // 调用实例cleanupDeps方法
      this.cleanupDeps()
    }
    // 返回观测数据
    return value
  }

  // 添加依赖
  /**
   * Add a dependency to this directive.
   */
  // 定义addDep方法，接收Dep类型依赖实例对象
  addDep (dep: Dep) {
    const id = dep.id
    // 如果不存在依赖，将新依赖对象id和对象添加进相应数组中
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // 并在dep对象中添加监视器自身
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  // 清理依赖项集合
  /**
   * Clean up for dependency collection.
   */
  // 定义cleanupDeps方法
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.computed) {
      // A computed property watcher has two modes: lazy and activated.
      // It initializes as lazy by default, and only becomes activated when
      // it is depended on by at least one subscriber, which is typically
      // another computed property or a component's render function.
      if (this.dep.subs.length === 0) {
        // In lazy mode, we don't want to perform computations until necessary,
        // so we simply mark the watcher as dirty. The actual computation is
        // performed just-in-time in this.evaluate() when the computed property
        // is accessed.
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        this.getAndInvoke(() => {
          this.dep.notify()
        })
      }
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      this.getAndInvoke(this.cb)
    }
  }

  getAndInvoke (cb: Function) {
    const value = this.get()
    if (
      value !== this.value ||
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep
    ) {
      // set new value
      const oldValue = this.value
      this.value = value
      this.dirty = false
      if (this.user) {
        try {
          cb.call(this.vm, value, oldValue)
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        cb.call(this.vm, value, oldValue)
      }
    }
  }

  /**
   * Evaluate and return the value of the watcher.
   * This only gets called for computed property watchers.
   */
  evaluate () {
    if (this.dirty) {
      this.value = this.get()
      this.dirty = false
    }
    return this.value
  }

  /**
   * Depend on this watcher. Only for computed property watchers.
   */
  depend () {
    if (this.dep && Dep.target) {
      this.dep.depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
```

---

