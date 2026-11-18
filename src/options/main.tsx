import ReactDOM from 'react-dom/client'
import { OptionsApp } from './OptionsApp'
import '../styles/panel.css'

const root = document.getElementById('root')!
const embedded = window.parent !== window
ReactDOM.createRoot(root).render(<OptionsApp embedded={embedded} />)

if (embedded) {
  new ResizeObserver(() => {
    // Only the frame height crosses the origin boundary. Settings stay inside the extension.
    window.parent.postMessage({ type: 'trackloom-settings-height', height: Math.ceil(root.getBoundingClientRect().height) }, '*')
  }).observe(root)
}
