# 打包机制

```js
const { readFileSync } = require('fs');
const path = require('path');
const traverse = require('babel-traverse').default;
const { transformFromAst, transform } = require('babel-core');

let ID = 0;

// 当前用户的操作的目录
const currentPath = process.cwd();

// 获取文件的依赖
function createAssets(filename) {
  // 读取文件内容
  const rowcode = readFileSync(filename, 'utf-8');

  // 将文件内容转换为ast结构，https://astexplorer.net/ 可以看到转化后的结构
  const ast = transform(rowcode).ast;

  // 解析文件依赖，将解析过后的依赖存入dependecies
  const dependecies = [];

  // traverse 函数是一个遍历 AST 的方法
  // 类型为 `ImportDeclaration` 的 AST 节点，其实就是我们的 `import xxx from xxxx`
  traverse(ast, {
    ImportDeclaration(path) {
      // 节点路径
      const sourcePath = path.node.source.value;
      // 将节点路径存入dependencies
      dependecies.push(sourcePath);
    }
  })

  // 将代码转换为es5 语法的代码
  const { code } = transformFromAst(ast, null, {
    presets: ['env']
  })

  // 导出模块, 全局ID+1 用于标识当前模块
  return {
    id: ID++,
    dependecies,
    code,
    filename,
  }
}

// 根据入口文件，生成依赖关系
function createGraph(entry) {
  // 入口文件依赖
  const entryAsset = createAssets(path.resolve(currentPath, entry));

  // 依赖关系是一个数组，将入口文件的依赖放在数组的第一个
  const graph = [entryAsset];

  // 使用for of 循环graph，因为在循环过程中会添加依赖进去，它会一直循环到不再添加新的依赖为止
  // foreach 只会循环一次
  for (const asset of graph) {
    // idMapping 指path-id 键值对，path 为require 引入的路径
    if (!asset.idMapping) {
      asset.idMapping = {};
    }

    // 获取asset 文件对应的文件夹
    const dir = path.dirname(asset.filename);

    // 解析文件的依赖
    asset.dependecies.forEach(dependeceyPath => {
      // 获取依赖的绝对定位
      // 例如：import a from './b'  =>  /User/xxxx/desktop/xproject/b
      const absolutePath = path.resolve(dir, dependeceyPath);

      // 解析依赖
      const dependeceyAsset = createAssets(absolutePath);

      // 生成idMapping path-id 键值对
      asset.idMapping[dependeceyPath] = dependeceyAsset.id;

      // 将解析的依赖push 到graph 中
      graph.push(dependeceyAsset);
    })
  }

  return graph;
}

// 打包我们搜集的graph，实际上打包就是将js代码拼接成字符串
function bundle(graph) {
  let modules = '';

  // 用node 模块函数包裹代码 function(require, module, exports){}
  // 将代码封装成 `1: [...], 2: [...]` 形式
  // 然后用 `{}` 包裹起来，形成一个对象， `{1: [...], 2: [...]}`
  // 这里数字1、2作为key 值，
  // 数组[...]作为value值，
  // 数组[0]是我们包裹的代码
  // 数组[1]是我们的idMapping
  graph.forEach(asset => {
    modules += `${asset.id}:[
        function(require, module, exports){${asset.code}},
        ${JSON.stringify(asset.idMapping)},
      ],`
  })

  // 创建一个require 函数，传入id，返回module 对象
  // 放入匿名立即执行函数，传入我们的用{}包裹的modules
  // 执行require(0) 我们的入口文件，一定是第一个执行
  // 创建子require函数，因为我们require 需要传入id，我们的idMapping 就用用上了，根据filename 找到id
  // 递归调用require，直到所有模块引入
  const wrap = `
  (function(modules){
    function require(id) {
      const [fn, idMapping] = modules[id];

      function childRequire(filename) {
        return require(idMapping[filename]);
      };

      const newModule = {exports: {}};

      fn(childRequire, newModule, newModule.exports);

      return newModule.exports;
    }

    require(0);
  })({${modules}});` // 不要忘了{}

  return wrap;
}

module.exports = entry => bundle(createGraph(entry))
```