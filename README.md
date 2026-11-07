# dQuests

App de produtividade com cara de MMO: missões viram XP, níveis, hábitos com streak, chefe da semana, treino e finanças. Roda no Android e no Windows. Feito com React + Vite, empacotado com Capacitor 8 (Android) e Electron (PC).

## Rodar no navegador (desenvolvimento)

```bash
npm install
npm run dev
```

Abre em http://localhost:5173. No modo dev, a store fica em `window.game` para testes pelo console.

## Configuração

Copie `.env.example` para `.env` e preencha:

- `VITE_UPDATE_REPO`: o repositório (`usuario/repositorio`) cujos releases o app confere para se atualizar.
- `VITE_SAVE_REPO`: o repositório privado onde fica o `save.json` da sincronização.

Os dois usam um token do GitHub que cada pessoa coloca no próprio app. Sem o `.env`, o app funciona normalmente, só sem atualização e sincronização.

## Gerar o APK

Precisa do JDK 21 e do Android SDK. Se o Gradle não achar o JDK, defina `org.gradle.java.home` em `android/gradle.properties` (ou `JAVA_HOME`).

```bash
npm run apk
```

O APK sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

## App de PC

```bash
npm run desktop
```

Abre o app no Electron. `npm run exe` gera o instalador em `release/`.

## Publicar uma versão

```bash
npm run release -- patch
```

Escreva antes a entrada da versão em `src/changelog.json`. O script gera o APK e o instalador de PC, faz commit e tag e cria o release com os dois arquivos (usa o `gh`).

## Sincronização

O save fica em `save.json` no repositório de `VITE_SAVE_REPO`. Cada conclusão vira um evento com ID; quando dois aparelhos divergem, o save da nuvem é a base e os eventos e edições que só existem no aparelho são aplicados por cima (`mergeData` em `src/game/store.ts`). Um `config.json` opcional no mesmo repositório ajusta o balanceamento e as frases da tela de abertura (`"frases": [...]`).

## Sons

Os sons ficam em `src/assets/sfx/<slot>.ogg` (ou mp3/wav), com o nome do slot de `src/fx/sound.ts` (ex.: `quest.mp3`, `levelup.mp3`, `click.ogg`). A pasta `src/assets/sfx/death/` tem vários arquivos para o chefe derrotado, sorteados a cada vez. Um slot sem arquivo usa um som sintetizado.

## Onde fica cada coisa

- `src/game/data.ts`: categorias, atributos, facções, conquistas, títulos e chefes
- `src/game/rules.ts`: curva de níveis, sorteio de XP e constantes de balanceamento
- `src/game/store.ts`: estado, virada de dia/semana, debuffs, XP, salvamento
- `src/fx/`: sons, vibração e eventos de animação
- `src/sync/sync.ts`: sincronização com o GitHub
- `electron/`: processo principal e ponte do app de PC
- `src/ui/`: telas e componentes
