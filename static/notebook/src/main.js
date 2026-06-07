import { createApp } from 'vue'
import App from './App.vue'

const el = document.getElementById('page-diary')
if (el) {
  const app = createApp(App)
  const vm = app.mount(el)
  window.nbVue = vm
}
