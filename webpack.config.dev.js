const path = require('path')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')

let mainConfig = {
    target: 'electron-main',
    entry: './src/main/main.js',
    output: {
        path: path.resolve(__dirname, 'app'),
        filename: 'main.js'
    },
    node: {
        __filename: false,
        __dirname: false
    },
    plugins: [
        new UglifyJsPlugin()
    ]
}

let rendererConfig = {
    target: 'electron-renderer',
    entry: {
        'renderer/index.js': './src/renderer/index.js',
        'renderer/worker.js': './src/renderer/worker.js',
    },
    output: {
        path: path.resolve(__dirname, 'app'),
        filename: '[name]'
    },
    resolve: {
        alias: {
            'vue$': 'vue/dist/vue.common.js' // 'vue/dist/vue.common.js' for webpack 1
        }
    },
    node: {
        __filename: false,
        __dirname: false
    }
}

module.exports = [mainConfig, rendererConfig]
