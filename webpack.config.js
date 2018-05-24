const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const VueLoaderPlugin = require('vue-loader/lib/plugin')

function resolve (dir) {
  return path.join(__dirname, dir)
}

module.exports = {
  mode: 'development',
  devtool: 'cheap-module-eval-source-map',
  devServer: {
    clientLogLevel: 'warning',
    hot: true,
    contentBase: false,
    compress: true,
    host: 'localhost',
    port: '9999',
    open: true,
    overlay: {
      warnings: true,
      errors: true
    },
    publicPath: '/',
    proxy: {},
    quiet: true,
    watchOptions: {
      poll: false
    }
  },
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'app.js'
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['vue-style-loader', 'css-loader'],
        include: resolve('src')
      },
      {
        test: /\.vue$/,
        use: 'vue-loader',
        include: resolve('src')
      },
      {
        test: /\.js$/,
        loader: 'babel-loader',
        include: resolve('src')
      },
      {
        test: /\.(png|jpe?g|gif|svg)(\?.*)?$/,
        loader: 'url-loader',
        include: resolve('src'),
        options: {
          limit: 10000,
          name: 'static/images/[name].[hash:7].[ext]'
        }
      }
    ]
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'index.html',
      inject: true
    })
  ],
  resolve: {
    extensions: ['.js', '.vue', '.json'],
    alias: {
      'vue$': 'vue/dist/vue.esm.js',
      '@': resolve('src'),
    }
  }
}