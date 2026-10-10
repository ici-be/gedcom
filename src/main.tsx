import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/700.css'
import './style.css'
import { App } from './ui/App'

// mise à jour automatique : la nouvelle version s'installe et s'applique au lancement suivant
registerSW({ immediate: true })

render(<App />, document.getElementById('app')!)
