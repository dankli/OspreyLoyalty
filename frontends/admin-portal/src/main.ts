import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import i18n from './i18n'
import { ensureAuthenticated } from './auth'

// Gate the console on a valid session (no-op when auth is disabled).
void ensureAuthenticated().then(() => {
  createApp(App).use(i18n).mount('#app')
})
