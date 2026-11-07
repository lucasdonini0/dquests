import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';
import App from './App';
import { TitleBar } from './ui/TitleBar';
import { Splash } from './ui/Splash';
import { desktop } from './fx/updater';
import { clickSound } from './fx/sound';
import { dataOf, mergeData, useGame } from './game/store';

if (import.meta.env.DEV) Object.assign(window, { game: useGame, dquests: { dataOf, mergeData } });

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#0b0a08' }).catch(() => {});
}

// Som de clique em qualquer botão (se o botão tocar outro som, só o outro toca)
document.addEventListener('click', e => {
  const b = (e.target as HTMLElement | null)?.closest?.('button');
  if (b && !b.disabled) clickSound();
}, true);

// No PC a janela não tem a barra do Windows: o app desenha a dele
if (desktop) document.documentElement.classList.add('desktop');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {desktop && <TitleBar />}
    <App />
    <Splash />
  </StrictMode>,
);
