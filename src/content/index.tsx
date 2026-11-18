import ReactDOM from 'react-dom/client'
import { PanelApp } from '@/panel/App'
import panelCss from '@/styles/panel.css?inline'

// 创建 Shadow DOM 容器
const existing = document.getElementById('tune-nest-root')
if (existing) {
  existing.remove()
}

const hostEl = document.createElement('div')
hostEl.id = 'tune-nest-root'
hostEl.style.position = 'fixed'
hostEl.style.inset = '0'
hostEl.style.zIndex = '2147483647'
hostEl.style.pointerEvents = 'none';
(document.body || document.documentElement).appendChild(hostEl)

const shadow = hostEl.attachShadow({ mode: 'closed' })

const styleEl = document.createElement('style')
styleEl.textContent = panelCss
shadow.appendChild(styleEl)

// React 挂载点
const mountEl = document.createElement('div')
mountEl.id = 'tune-nest-app'
shadow.appendChild(mountEl)

// 渲染 React 应用
const root = ReactDOM.createRoot(mountEl)
root.render(<PanelApp />)
