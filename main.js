import App from './App'
import uviewPlus from '@/uni_modules/uview-plus'
// import { createPinia } from '
// 使用持久化插件
import pinia from '@/store/index'

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
export function createApp() {
  const app = createSSRApp(App)
  app.use(uviewPlus)
  app.use(pinia)
  return {
    app,
	pinia
  }
}
// #endif