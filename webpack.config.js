const path = require('path');
const ESLintPlugin = require('eslint-webpack-plugin');

module.exports = {
  entry: './client/index.js', // точка входа клиента
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true, // очищать папку dist перед каждой сборкой
  },
  mode: 'development', // для продакшена позже поменяете на 'production'
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  plugins: [
    new ESLintPlugin({
      extensions: ['js'],
    }),
  ],
  devtool: 'source-map', // удобно для отладки
};