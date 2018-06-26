# Vue源码探究-类初始化函数详情

随着初始化函数的执行，实例的生命周期也开始运转，在初始化函数里可以看到每个模块向实例集成的功能，这些功能的具体内容以后在单独的文章里继续探索。现在来详细看看类初始化函数的详细代码。

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





