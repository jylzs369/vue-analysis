# Vue源码探究-模板编译的实现

核心模块里的功能基本上都研究了一圈，关于Vue组件实例化的内部原理和数据处理基本上都理解了，这篇文章主要来摸索一下被我归于Vue三大核心功能里的最后一个还未探索的部分——模板编译器。（其余之二是数据绑定和虚拟节点渲染）

先来对编译模块的组成部分做个总览，代码大致分为编译器入口、模板编译、指令编译、代码生成、辅助函数、优化处理几个部分。按照之前的惯例，由编译器的入口来展开各个部分的探索。

## 编译器入口

*以下代码位于[src/compiler/index.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/compiler/index.js)*

```js
// 导入parse模块
import { parse } from './parser/index'
// 导入optimize模块
import { optimize } from './optimizer'
// 导入generate模块
import { generate } from './codegen/index'
// 导入createCompilerCreator功能函数
import { createCompilerCreator } from './create-compiler'

// createCompilerCreator函数允许创建可切换的
// 解析器/优化器/代码生成器三类编译器，例如SSR优化编译器。
// 在此只暴露一个默认的使用初始设置的编译器
// 从代码组织可知其他详细设置由各执行环境进行补充
// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// 创建并导出createCompiler对象，暴露默认编译器
// 编译器使用createCompilerCreator函数创建，传入baseCompile函数
// 该函数接受传入的模板字符串template和编译器配置对象options
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 编译模板生成抽象节点树
  const ast = parse(template.trim(), options)
  // 如果设置优化属性则进行优化处理
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  // 根据抽象树生成代码
  const code = generate(ast, options)
  // 返回格式化的编译器
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

从此入口文件可以得知，编译模块的主要任务是生成默认的编译器对象。在导出对象之前，分别对模板代码进行了编译得出抽象节点树，再根据抽象节点生成代码待实例渲染。核心的两大功能 `parse` 、`codegen` 从导入的模块和生成编译器的代码中便可确定。

## parse


## codegen

## optimize




---

关于模板编译的探索，主要是为了解决一直以来比较在意的一个问题，即我们写的 `HTML` 代码是如何被转化成抽象的数据为Vue内部使用的。也是由于之前翻阅设计模式专题的书籍时，看过别人对实现小型框架的模板编译的处理，印证一下自己猜测的实现原理，或者做个比较。