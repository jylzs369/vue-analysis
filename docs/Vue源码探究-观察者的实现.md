
### 状态
*下面代码位于[vue/src/core/instance/state.js](https://github.com/vuejs/vue/blob/dev/src/core/instance/state.js)*
```js
// 导出stateMixin函数，接收形参Vue，
// 使用Flow进行静态类型检查指定为Component类
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
stateMixin执行的是关于状态观察的一系列方法的并入，主要是三个方面：
- 定义实例$data和$props属性的存取器
- 定义实例的$set、$delete方法，具体实在定义在观察者模块中
- 定义实例的$watch方法