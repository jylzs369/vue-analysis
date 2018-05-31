# Vue源码探究-构建版本的区别

基于[Benchmark](https://www.stefankrause.net/js-frameworks-benchmark7/table.html)的评估结果可以看出Vue 2.0版本在整体的性能上得到了大幅优化，与React和Angular新版相比相差无几。在提供给使用者的构建版本方面，也进行了针对性的细化，输出了多种不同的版本，以便满足不同需求的开发者使用更精细的更适合自己的版本进行开发。

[官方文档](https://github.com/vuejs/vue/tree/dev/dist)上展示的概括图表：

| | UMD | CommonJS | ES Module |
| --- | --- | --- | --- |
| **Full** | vue.js | vue.common.js | vue.esm.js |
| **Runtime-only** | vue.runtime.js | vue.runtime.common.js | vue.runtime.esm.js |
| **Full (production)** | vue.min.js | | |
| **Runtime-only (production)** | vue.runtime.min.js | | |


1.支持服务端渲染。
2.构建工具打包后使用Vue运行时的更小


---

在2.0版本发布以后，Vue开始提供不同构建版本，大致了解之后发现在不同开发场景下选择适当的版本有助于后续提升应用的整体性能，然而苦于没有找到详细说明不同版本使用差异的文章，只好自己来做一个讨论，我想对于目前跟我一样还不太了解Vue内部实现机制的同学来说，弄明白各种版本的差异是一个快速得到性能优化最佳实践的途径。