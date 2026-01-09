import {
  defineConfig
} from "vite";
import path from "path";
import uni from "@dcloudio/vite-plugin-uni";
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: [{
        find: "@store",
        replacement: path.resolve(__dirname, "./store"),
      },
      {
        find: "@http",
        replacement: path.resolve(__dirname, "./http"),
      },
      {
        find: "@components",
        replacement: path.resolve(__dirname, "./components"),
      },
      {
        find: "@static",
        replacement: path.resolve(__dirname, "./static"),
      },
      {
        find: "@utils",
        replacement: path.resolve(__dirname, "./utils"),
      },
    ],
  },
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
});