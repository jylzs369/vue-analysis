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
  // 编译模板生成抽象语法树
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

从此入口文件可以得知，编译模块的主要任务是生成默认的编译器对象。在导出对象之前，分别对模板代码进行了编译得出抽象语法树，再根据抽象语法树生成代码待实例渲染。核心的两大功能 `parse` 、`codegen` 从导入的模块和生成编译器的代码中便可确定。

## parse

*以下代码位于[src/compiler/parse/index.js](https://github.com/vuejs/vue/blob/v2.5.17-beta.0/src/compiler/index.js)*

从名称就可知这一功能是解析使用Vue语法写成的模板。这一功能的目的是生成抽象语法数据，为了提供给Vue的内部的机制来使用，完成诸如数据绑定、生命周期等功能的实现。`parse` 模块也有自己的入口文件，其余的模块是针对性的具体解析器的实现，包括实体解码 `enity-decoder`、过滤器解析 `filter-parser`、html解析 `html-parser`、文字解析 `text-parser` 四个小模块。`parse` 的入口文件将这四个模块功能集中而成一个综合性的模板解析器。

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
// 接收标签名称，属性列表，父抽象对象三个参数
export function createASTElement (
  tag: string,
  attrs: Array<Attr>,
  parent: ASTElement | void
): ASTElement {
  // 返回格式化的抽象语法对象，作为真实DOM的信息载体
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

第一部分的是解析器实现的准备步骤，如上述代码片段可看到，与我们平时常用的模板语法匹配的正则表达式全都被定义在里面了，定义的状态变量有具体还不清楚，只能靠名字猜测一番，多数与核心逻辑似乎无关。最后的 `createASTElement` 函数用于具体生成抽象语法树对象。其余辅助函数位于 `parse` 函数之后，数量众多，不全展开，先来解析器的具体实现逻辑：

```js
// parse函数的功能是讲HTML字符串转换成抽象语法树
/**
 * Convert HTML string to AST.
 */
// 定义并导出parse函数，接受模板字符串和编译器配置对象
// 返回抽象语法树类型的对象
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  // 定义报错方法
  warn = options.warn || baseWarn

  // 获取isPreTag、mustUseProp、getTagNamespace方法
  // 未定义则返回no函数，始终返回false
  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no

  // 摘取模块函数，获取转换函数数组，预转换函数数组、后转换函数数组
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  // 获取分隔符
  delimiters = options.delimiters

  // 定义stack数组，用于存放处理过的element
  const stack = []
  // 获取保留空白标识
  const preserveWhitespace = options.preserveWhitespace !== false
  // 定义根元素
  let root
  // 定义当前处理父级元素
  let currentParent
  // 定义标识
  let inVPre = false
  let inPre = false
  let warned = false

  // 定义warnOnce函数，接受错误提示文字
  function warnOnce (msg) {
    // 当warned标识为false时设置为true，抛出错误提示信息
    if (!warned) {
      warned = true
      warn(msg)
    }
  }

  // 定义closeElement函数，接受元素节点
  // 用于关闭元素进行抽转换处理
  function closeElement (element) {
    // 检查预转换状态
    // check pre state
    // 元素为pre状态，设置标识inVPre标识为false
    if (element.pre) {
      inVPre = false
    }
    // 判断元素tag，是pre tag时设置inPre标识为false
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // 应用后转换，逐一调用postTransforms数组中的函数
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  // 调用parseHTML解析模板字符串，传入一系列参数和四个节点处理方法
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    // 传入start方法，接受元素标签、属性、unary标识，用于开始处理元素节点
    start (tag, attrs, unary) {
      // 检查命名空间，如果有父级命名空间则继承命名空间
      // check namespace.
      // inherit parent ns if there is one
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // 处理IE浏览器svg元素的bug
      // handle IE svg bug
      /* istanbul ignore if */
      // IE浏览器下且命名空间是svg时特殊处理bug
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      // 创建抽象语法树元素
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      // 有命名空间时，设置元素的ns属性
      if (ns) {
        element.ns = ns
      }

      // 检查如果是禁用标签且非服务器渲染，设置元素的forbidden属性
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        // 非生产环境给出警告提示
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.'
        )
      }

      // 遍历预转换数组执行元素的预转换
      // apply pre-transforms
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      // inVPre为false时预处理元素
      if (!inVPre) {
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }

      // 设置inPre标识
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      // inVPre为true时
      if (inVPre) {
        // 处理原始属性，将原始属性转换成名值对数组
        processRawAttrs(element)
      } else if (!element.processed) {
        // 否则当元素不在处理中时，处理结构指令for、if、once
        // structural directives
        processFor(element)
        processIf(element)
        processOnce(element)
        // 处理元素
        // element-scope stuff
        processElement(element, options)
      }

      // 定义checkRootConstraints函数检查根节点约束
      // 在非生产中给出警告，只允许有一个根节点
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

      // 节点树管理
      // tree management
      // 首先进行根节点的规范处理，必须有且只有一个根节点
      // 在条件指令下相应路径的节点树也必须满足只含一个根节点的约束

      // 当根节点不存在，将当前处理element节点当作根节点，并检验根节点约束
      if (!root) {
        root = element
        checkRootConstraints(root)
      } else if (!stack.length) {
        // 如果根节点存在，且stack有元素
        // 当根节点有含有if指令且当前处理元素有elseif或else指令时
        // allow root elements with v-if, v-else-if and v-else
        if (root.if && (element.elseif || element.else)) {
          // 检查当前处理元素是否符合根节点约束
          checkRootConstraints(element)
          // 向节点添加if条件对象
          addIfCondition(root, {
            exp: element.elseif,
            block: element
          })
        } else if (process.env.NODE_ENV !== 'production') {
          // 否则在非生产环境报错，提示必须含有一个根节点元素
          warnOnce(
            `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`
          )
        }
      }
      // 根据当前节点的情况确定存放位置，分为条件节点，slot节点和普通节点
      // 如果当前节点父级存在，且元素非禁用
      if (currentParent && !element.forbidden) {
        // 如果元素有else指令，则获取前一兄弟节点处理if条件
        if (element.elseif || element.else) {
          processIfConditions(element, currentParent)
        } else if (element.slotScope) { // scoped slot
          // 如果元素是slot，设置currentParent.plain
          currentParent.plain = false
          // 获取元素slot目标名称，未设置则设为default
          const name = element.slotTarget || '"default"'
          // 设置父级slot数组中名称为name的为当前处理元素
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        } else {
          // 否则向父级子节点数组中添加当前处理元素
          currentParent.children.push(element)
          // 设置元素的父级为currentParent
          element.parent = currentParent
        }
      }
      // 检查是否是自闭合元素
      // 如果unary标识为false
      if (!unary) {
        // 设置当前处理元素为currentParent
        currentParent = element
        // 并存入栈对立
        stack.push(element)
      } else {
        // 否则执行closeElement函数进行闭合标签后转换处理
        closeElement(element)
      }
    },

    // 传入end方法，用于结束元素节点时的处理
    end () {
      // 移除尾空格
      // remove trailing whitespace
      // 获取最后一个栈队列元素
      const element = stack[stack.length - 1]
      // 获取元素的最后一个子节点
      const lastNode = element.children[element.children.length - 1]
      // 如果最后一个节点是文字节点，且是空字符串，移除最后该文字节点
      if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) {
        element.children.pop()
      }
      // 尾出栈
      // pop stack
      stack.length -= 1
      // 重置currentParent为最后一个栈元素
      currentParent = stack[stack.length - 1]
      // 执行关闭当前元素处理
      closeElement(element)
    },

    // 传入chans方法，处理文字节点
    chars (text: string) {
      // currentParent不存在时
      if (!currentParent) {
        // 当模板之传入了纯字符或根节点外有文字时给出警告
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
      // 处理IE浏览器下textarea元素placeholder属性的BUG
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      // 获取currentParent子元素
      const children = currentParent.children
      // 处理text，修剪空格
      text = inPre || text.trim()
        // 当text不为空时
        // currentParent是文字节点时不做处理，否则调用HTML实体解码方法处理
        ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
        // 当text为空时
        // 如果保留空格标识为真，且父元素有子节点存在时，text为空格否则为空字符串
        // 仅在它不在起始标记之后时保留空格
        // only preserve whitespace if its not right after a starting tag
        : preserveWhitespace && children.length ? ' ' : ''
      // text存在时执行如下操作
      if (text) {
        // 满足!inVPre且text非空条件时，解析text结果赋给res，向子节点添加属性节点
        let res
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          children.push({
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          })
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          // text非空或不存在子节点或子节点最后一个元素不为空格，向子节点添加文字节点
          children.push({
            type: 3,
            text
          })
        }
      }
    },
    // 传入comment方法，处理注释节点
    comment (text: string) {
      // 向当前父级子节点添加注释节点
      currentParent.children.push({
        type: 3,
        text,
        isComment: true
      })
    }
  })
  // 返回生成的抽象语法树对象
  return root
}
```

从解析器函数里可以一窥解析模板的大致流程，在生成抽象语法树对象的根本目标下，重点进行了模板指令的处理和抽象节点树的构建。在其中分为


## codegen

## optimize




---

关于模板编译的探索，主要是为了解决一直以来比较在意的一个问题，即我们写的 `HTML` 代码是如何被转化成抽象的数据为Vue内部使用的。也是由于之前翻阅设计模式专题的书籍时，看过别人对实现小型框架的模板编译的处理，印证一下自己猜测的实现原理，或者做个比较。