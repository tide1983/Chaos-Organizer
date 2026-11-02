const path = require('path');
const ESLintPlugin = require('eslint-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './client/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader' },
      },
    ],
  },
  plugins: [
    new ESLintPlugin({ extensions: ['js'] }),
    new CopyPlugin({
      patterns: [
        { from: 'client/index.html', to: 'index.html' },
        { from: 'client/style.css', to: 'style.css' },
      ],
    }),
  ],
  devtool: 'source-map',
};