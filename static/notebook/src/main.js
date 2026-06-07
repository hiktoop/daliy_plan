import { createApp } from 'vue'
import App from './App.vue'

console.log('[notebook] main.js 开始加载')

const el = document.getElementById('page-diary')
console.log('[notebook] page-diary 元素:', el)

if (el) {
  try {
    const app = createApp(App)
    const vm = app.mount(el)
    window.nbVue = vm
    console.log('[notebook] Vue 应用挂载成功', vm)
    console.log('[notebook] nbVue 方法:', Object.keys(vm.$options.methods || {}))
  } catch (e) {
    console.error('[notebook] 挂载失败:', e.message, e.stack)
    el.innerHTML = '<div style="padding:20px;color:red;font-size:14px;">❌ Vue 挂载失败: ' + e.message + '</div>'
  }
} else {
  console.error('[notebook] 找不到 #page-diary 元素！')
}
