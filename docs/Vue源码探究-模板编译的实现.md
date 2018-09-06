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

*以下代码位于[src/compiler/parse/index.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/compiler/index.js)*

从名称就可知这一功能是解析使用Vue语法写成的模板。这一功能的目的是生成抽象节点数据，为了提供给Vue的内部的机制来使用，完成诸如数据绑定、生命周期等功能的实现。`parse` 模块也有自己的入口文件，其余的模块是针对性的具体解析器的实现，包括实体解码 `enity-decoder`、过滤器解析 `filter-parser`、html解析 `html-parser`、文字解析 `text-parser` 四个小模块。`parse` 的入口文件将这四个模块功能集中而成一个综合性的模板解析器。

首先来看看 `parse` 的入口文件。如预期一样，这一部分需要对输入的Vue模板语法进行解析，所以这段代码的最开始便定义了需要解析的语法的模式匹配正则表达式。除了引入模块解析器、辅助函数之外，整个代码分为两大部分，第一部分是定义语法解析匹配的正则表达式、配置状态和一系列函数，第二部分是解析器的实现。

```js
// 定义模板语法匹配正则表达式
export const onRE = /^@|^v-on:/
export const dirRE = /^v-|^@|^:/
export const forAliasRE = /([^]*?)\s+(?:in|of)\s+([^]*)/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g

const argRE = /:(.*)$/
export const bindRE = /^:|^v-bind:/
const modifierRE = /\.[^.]+/g

// 配置状态
// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace

type Attr = { name: string; value: string };

// 定义并导出createASTElement函数
// 接收标签名称，属性列表，父级抽象元素三个参数
export function createASTElement (
  tag: string,
  attrs: Array<Attr>,
  parent: ASTElement | void
): ASTElement {
  // 返回格式化的抽象元素，作为真实DOM的信息载体
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    parent,
    children: []
  }
}
```

第一部分的是解析器实现的准备步骤，如上述代码片段可看到，与我们平时常用的模板语法匹配的正则表达式全都被定义在里面了，定义的状态变量有具体还不清楚，只能靠名字猜测一番，多数与核心逻辑似乎无关。最后的 `createASTElement` 函数用于具体生成抽象元素对象。其余辅助函数位于 `parse` 函数之后，数量众多，不全展开，先来解析器的具体实现逻辑：

```js

/**
 * Convert HTML string to AST.
 */
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no

  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg) {
    if (!warned) {
      warned = true
      warn(msg)
    }
  }

  function closeElement (element) {
    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    start (tag, attrs, unary) {
      // check namespace.
      // inherit parent ns if there is one
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      if (ns) {
        element.ns = ns
      }

      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.'
        )
      }

      // apply pre-transforms
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      if (!inVPre) {
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        processFor(element)
        processIf(element)
        processOnce(element)
        // element-scope stuff
        processElement(element, options)
      }

      function checkRootConstraints (el) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.tag === 'slot' || el.tag === 'template') {
            warnOnce(
              `Cannot use <${el.tag}> as component root element because it may ` +
              'contain multiple nodes.'
            )
          }
          if (el.attrsMap.hasOwnProperty('v-for')) {
            warnOnce(
              'Cannot use v-for on stateful component root element because ' +
              'it renders multiple elements.'
            )
          }
        }
      }

      // tree management
      if (!root) {
        root = element
        checkRootConstraints(root)
      } else if (!stack.length) {
        // allow root elements with v-if, v-else-if and v-else
        if (root.if && (element.elseif || element.else)) {
          checkRootConstraints(element)
          addIfCondition(root, {
            exp: element.elseif,
            block: element
          })
        } else if (process.env.NODE_ENV !== 'production') {
          warnOnce(
            `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`
          )
        }
      }
      if (currentParent && !element.forbidden) {
        if (element.elseif || element.else) {
          processIfConditions(element, currentParent)
        } else if (element.slotScope) { // scoped slot
          currentParent.plain = false
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        } else {
          currentParent.children.push(element)
          element.parent = currentParent
        }
      }
      if (!unary) {
        currentParent = element
        stack.push(element)
      } else {
        closeElement(element)
      }
    },

    end () {
      // remove trailing whitespace
      const element = stack[stack.length - 1]
      const lastNode = element.children[element.children.length - 1]
      if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) {
        element.children.pop()
      }
      // pop stack
      stack.length -= 1
      currentParent = stack[stack.length - 1]
      closeElement(element)
    },

    chars (text: string) {
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.'
            )
          } else if ((text = text.trim())) {
            warnOnce(
              `text "${text}" outside root element will be ignored.`
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      text = inPre || text.trim()
        ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
        // only preserve whitespace if its not right after a starting tag
        : preserveWhitespace && children.length ? ' ' : ''
      if (text) {
        let res
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          children.push({
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          })
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          children.push({
            type: 3,
            text
          })
        }
      }
    },
    comment (text: string) {
      currentParent.children.push({
        type: 3,
        text,
        isComment: true
      })
    }
  })
  return root
}

```


## codegen

## optimize




---

关于模板编译的探索，主要是为了解决一直以来比较在意的一个问题，即我们写的 `HTML` 代码是如何被转化成抽象的数据为Vue内部使用的。也是由于之前翻阅设计模式专题的书籍时，看过别人对实现小型框架的模板编译的处理，印证一下自己猜测的实现原理，或者做个比较。