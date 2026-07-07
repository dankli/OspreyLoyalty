import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

/** Micro-frontend contract (ADR-0004): render into a host element, return the teardown. */
export function mount(el: HTMLElement): () => void {
  const app = createApp(App)
  app.mount(el)
  return () => app.unmount()
}
