# Vue源码探究-类初始化函数详情

随着初始化函数的执行，实例的生命周期也开始运转，在初始化函数里可以看到每个功能模块赋予实例的初始化函数，这些功能的具体内容以后会在单独的文章里继续探索。接下来详细看看类初始化函数的详细代码。

## 类初始化函数的详情

### 头部引用
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





