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

从解析器函数里可以一窥解析模板的大致流程，在生成抽象语法树对象的根本目标下，重点进行了模板指令的处理和抽象节点树的构建。在其中分为普通元素节点、文本节点和注释节点的抽象处理，分别对应了`start` 和 `end` 处理元素节点、`char` 处理文本节点、`comment` 处理注释节点。这个函数会将准备好的参数和方法一并传入 `parseHtml` 函数做进一步的抽象实现，上述传入时定义的方法也会随之传入，应用相应类别的解析器处理模板。接着来从最先调用的 `parseHtml` 解析器来看看各个细分化了的解析器函数。

### parseHtml

```js

export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last, lastTag
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd))
            }
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
        advance(textEnd)
      }

      if (textEnd < 0) {
        text = html
        html = ''
      }

      if (options.chars && text) {
        options.chars(text)
      }
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 定义辅助函数
  ...
}
```

### parseText

```js
// 定义默认正则表达式
const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

// 完整构建版本中修改分隔符后，依照新分隔符重新定义的文本匹配正则表达式
const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

// 定义TextParseResult类型的字符解析结果对象
type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

// 定义并导出parseText函数，接受字符串和分隔符两个参数
// 返回TextParseResult类型的结果
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  // 根据delimiters是否传入选择解析文本模板的正则表达式
  // 未传入时采用默认的分隔符，使用默认正则表达式
  // 独立构建时可以修改模板的分割符，传入新分隔符后创建新正则表达式
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  // 传入的文本不匹配则返回
  if (!tagRE.test(text)) {
    return
  }
  // 定义tokens数组
  const tokens = []
  const rawTokens = []
  // 获取上一次匹配索引
  let lastIndex = tagRE.lastIndex = 0
  // 定义变量
  let match, index, tokenValue
  // 使用正则表达式检验字符串匹配，将当前匹配对象赋值给match
  while ((match = tagRE.exec(text))) {
    // 获取当前匹配字符索引
    index = match.index
    // 添加文本token
    // push text token
    // 当前匹配字符索引大于上一匹配索引时
    if (index > lastIndex) {
      // 添加该匹配字符到rawTokens，字符串化后添加到tokens中
      rawTokens.push(tokenValue = text.slice(lastIndex, index))
      tokens.push(JSON.stringify(tokenValue))
    }
    // 标签token
    // tag token
    // 匹配过滤器表达式
    const exp = parseFilters(match[1].trim())
    // 添加格式化后的匹配表达式到tokens中
    tokens.push(`_s(${exp})`)
    rawTokens.push({ '@binding': exp })
    // 重置上一次匹配符索索引，开始下一次匹配
    lastIndex = index + match[0].length
  }
  // 逐步检验文本完成后，如果上一次匹配字符索引小于传入字符串长度
  // 即存在剩余未匹配的字符
  if (lastIndex < text.length) {
    // 将剩余未匹配字符添加到rawTokens、字符串化后添加到tokens中
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  // 返回格式化的字符串解析结果对象
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}
```

除去正则匹配的细节，解析字符串的目的很清晰，是要将符合模板字符串的内容转换成格式化的对象。至于这个对象怎么用，乃是之后要做的事情。在这个实现中，还可以看到Vue对于修改模板字符串的支持。

### parseFilter

```js
// 定义正则表达式
const validDivisionCharRE = /[\w).+\-_$\]]/

// 定义并导出parseFilters函数，传入过滤表达式
export function parseFilters (exp: string): string {
  // 初始化变量
  let inSingle = false
  let inDouble = false
  let inTemplateString = false
  let inRegex = false
  let curly = 0
  let square = 0
  let paren = 0
  let lastFilterIndex = 0
  let c, prev, i, expression, filters

  // 遍历过滤表达式字符串
  for (i = 0; i < exp.length; i++) {
    // 设置前一字符
    prev = c
    // 获取当前字符
    c = exp.charCodeAt(i)
    // 单引号标识
    if (inSingle) {
      // 当字符c为'且前一符号不为\，设置inSingle为false
      if (c === 0x27 && prev !== 0x5C) inSingle = false
    } else if (inDouble) { // 双引号标识
      // 当字符为”且前一符号不为\，设置inDouble为false
      if (c === 0x22 && prev !== 0x5C) inDouble = false
    } else if (inTemplateString) { // 模板字符串标识
      // 当字符为`，且前一符号不为\，设置inTemplateString为false
      if (c === 0x60 && prev !== 0x5C) inTemplateString = false
    } else if (inRegex) { // 正则标识
      // 当字符为/，且前一符号不为\，设置inRegex为false
      if (c === 0x2f && prev !== 0x5C) inRegex = false
    } else if (
      // 当字符为|，前后字符不为|且curly、square、paren标识均为false
      c === 0x7C && // pipe
      exp.charCodeAt(i + 1) !== 0x7C &&
      exp.charCodeAt(i - 1) !== 0x7C &&
      !curly && !square && !paren
    ) {
      // 如果expression未定义
      if (expression === undefined) {
        // 即此时是第一个过滤器情况下，结束表达
        // first filter, end of expression
        // 最后过滤器索引加1
        lastFilterIndex = i + 1
        // 截取表达式并却出空格
        expression = exp.slice(0, i).trim()
      } else {
        // 添加过滤器到filter数组中
        pushFilter()
      }
    } else {
      // 若不符合以上情况则根据匹配以下字符，处理各标识变量
      switch (c) {
        case 0x22: inDouble = true; break         // "
        case 0x27: inSingle = true; break         // '
        case 0x60: inTemplateString = true; break // `
        case 0x28: paren++; break                 // (
        case 0x29: paren--; break                 // )
        case 0x5B: square++; break                // [
        case 0x5D: square--; break                // ]
        case 0x7B: curly++; break                 // {
        case 0x7D: curly--; break                 // }
      }
      // 如果字符是/
      if (c === 0x2f) { // /
        let j = i - 1
        let p
        // 寻找前面第一个非空字符
        // find first non-whitespace prev char
        for (; j >= 0; j--) {
          p = exp.charAt(j)
          if (p !== ' ') break
        }
        // 如果前面不存在非空字符或者匹配有效分割字符失败
        if (!p || !validDivisionCharRE.test(p)) {
          // 设置inRegex标识
          inRegex = true
        }
      }
    }
  }

  // 表达式未定义时
  if (expression === undefined) {
    // 截取表达式片段，并去除空格
    expression = exp.slice(0, i).trim()
  } else if (lastFilterIndex !== 0) {
    // 如存在表达式，且最后一个过滤器索引不为0
    // 则添加表达式到filter中
    pushFilter()
  }

  // 定义pushFilter函数
  function pushFilter () {
    // 向filter数组中添加截取的表达式片段
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
    // 递增lastFilterIndex
    lastFilterIndex = i + 1
  }

  // filters存在时遍历filters
  if (filters) {
    for (i = 0; i < filters.length; i++) {
      // 处理expression
      expression = wrapFilter(expression, filters[i])
    }
  }
  // 返回expression
  return expression
}

// 定义wrapFilter函数，接收表达式和filter
function wrapFilter (exp: string, filter: string): string {
  // 获取(字符
  const i = filter.indexOf('(')
  // 如果不存在(字符
  if (i < 0) {
    // 返回格式化的过滤器字符串
    // _f: resolveFilter
    return `_f("${filter}")(${exp})`
  } else {
    // 存在(字符则获取filter的名称和参数
    const name = filter.slice(0, i)
    const args = filter.slice(i + 1)
    // 返回格式化的过滤器字符串
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
```

解析过滤器的过程涉及稍显繁琐的字符串匹配检查，要保证表达式配对符号的一致，检测表达式内容符合过滤器的规范，但其最终目的也是把处理好的过滤器转换成格式化的字符串，留待以后使用。

## codegen

## optimize




---

关于模板编译的探索，主要是为了解决一直以来比较在意的一个问题，即我们写的 `HTML` 代码是如何被转化成抽象的数据为Vue内部使用的。也是由于之前翻阅设计模式专题的书籍时，看过别人对实现小型框架的模板编译的处理，印证一下自己猜测的实现原理，或者做个比较。