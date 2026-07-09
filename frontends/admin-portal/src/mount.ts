import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import i18n from './i18n'

/** Micro-frontend contract (ADR-0004): render into a host element, return the teardown. */
export function mount(el: HTMLElement): () => void {
  const app = createApp(App)
  app.use(i18n)
  app.mount(el)
  return () => app.unmount()
}
