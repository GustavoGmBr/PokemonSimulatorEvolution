# Pokémon Simulator Evolution

Recriação do jogo do zero. O Pokémon Simulator Remake serve como referência de comportamento para as mecânicas. O código e a interface do Evolution serão escritos neste projeto.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `apps/web/src/` | Telas, componentes, controles e apresentação do jogo. |
| `apps/server/src/` | API local e persistência do progresso e das partidas. |
| `packages/engine/src/` | Regras de jogo, como atributos, combate, captura, evolução e progressão. |
| `packages/data/src/` | Catálogos de espécies, formas, golpes, itens e adversários. |
| `recursos/Pokemons/` | Acervo de sprites de Pokémon. |
| `recursos/Shinys/` | Acervo de sprites shiny. |
| `recursos/Treinadores/` | Acervo de sprites de treinadores. |

O servidor vai aplicar as regras do motor aos dados do catálogo e guardar o resultado nos saves. A interface envia as ações do jogador à API e apresenta o estado retornado. O motor deve receber os dados de que precisa e funcionar sem acesso à API, ao banco ou à interface.

## Estado inicial

O projeto está organizado como um monorepo com npm workspaces. A tela inicial usa React, TypeScript, Vite e shadcn/ui. Cada jornada guarda o nome do treinador, seu sprite e o Pokémon inicial (no banco SQLite do servidor local; no modo de desenvolvimento, no navegador). O seletor lista os PNGs de `recursos/Treinadores/` e permite pesquisar pelo nome do arquivo. A API e as mecânicas entram nas próximas etapas.

Em **Gerenciar saves**, selecione uma jornada para abri-la ou use o menu de contexto para abrir, exportar ou excluir. **Exportar todos** baixa um backup JSON. **Importar saves** aceita backups individuais ou completos do Evolution e adiciona cópias às jornadas já existentes.

O menu do jogo ocupa a janela e mantém a barra lateral ao navegar. Use **Ctrl/⌘ + K** ou **/** para buscar áreas e Pokémon, **Ctrl/⌘ + B** para alternar a barra lateral ou pressione a letra exibida para abrir um destino. **Atalhos** (`K`) lista os controles do menu.

A Pokédex Nacional inclui 1.025 espécies e abre todas as fichas desde o início da jornada. Os filtros de nome, número nacional, geração, tipo e status podem ser combinados. A ficha mostra os sprites locais nas variantes normal e brilhante, e busca a arte e os sprites alternativos de formas no [acervo de imagens da PokéAPI](https://github.com/PokeAPI/sprites). Os requisitos de evolução usam os [dados de evolução da PokéAPI](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_evolution.csv) como referência. Os requisitos das formas especiais seguem o Remake.

## Rodar a interface

No Windows, execute `iniciar-teste.bat` para iniciar o Vite e abrir o navegador.

Com Node.js 22.12 ou mais recente, execute na raiz do projeto:

```powershell
npm ci
npm run dev
```

Abra o endereço indicado pelo Vite. Use `npm run typecheck` para checar os tipos e `npm run build` para gerar a versão de produção.

## Executável para Windows (bandeja)

O pacote do Windows segue o mesmo esquema do Pokémon Simulator Remake: um **launcher** pequeno, o **Node.js embutido** e o servidor do jogo, com os saves num banco **SQLite**.

```
PokemonSimulatorEvolution/
  PokemonSimulatorEvolution.exe   launcher (bandeja do Windows; Go, em launcher/)
  runtime/node.exe                Node.js do pacote (o jogador não instala nada)
  app/server.mjs                  servidor do jogo (apps/server, empacotado com esbuild)
  app/web/                        interface (apps/web compilada)
  recursos/                       imagens e músicas (fora da main; vêm da branch "recursos")
  saves/game.db                   banco SQLite com saves e preferências (+ saves/backups/)
  LEIAME.md, distribution.json
```

- **Launcher:** inicia `runtime\node.exe app\server.mjs` sem janela, espera a linha `Jogo pronto: http://127.0.0.1:PORTA/`, abre o navegador e fica na bandeja. A porta é **34600**, a mesma do Remake (se estiver ocupada, usa a próxima livre). Ao sair, pede ao servidor que feche o banco (`stop` na entrada padrão).
- **Atualização:** ao abrir procura uma versão mais nova nas Releases (SHA-256 conferido), baixa `PokemonSimulatorEvolution-vX.Y.Z-update-win-x64.zip`, troca `app\` e o `.exe` e reinicia. Saves, `recursos\` e `runtime\` não são tocados. Depois verifica a cada 6 horas e avisa na bandeja.
- **Primeira abertura sem o jogo:** o `.exe` solto da release (usado pela atualização da linha 1.0.x) não traz o Node.js nem `app/`; ao abrir ele baixa o pacote completo da release mais nova, confere o SHA-256 e instala `runtime/` e `app/` (e `recursos/`, só se a pasta ainda não existir). Código em `launcher/bootstrap.go`.
- **Menu da bandeja:** abrir o jogo, verificar/instalar atualização, iniciar com o Windows, abrir as pastas de recursos, saves e logs (`%AppData%\PokemonSimulatorEvolution`), sair.
- **Linha de comando:** `--background` (não abre o navegador), `--no-update`, `--stop` (encerra o jogo aberto), `--recursos=`.
- **Saves em SQLite:** `apps/server` grava em `saves/game.db` (`node:sqlite`, migrações em `db.ts`; uma linha por jornada em `saves`, preferências em `settings`). A cada início o servidor faz um backup consistente em `saves/backups/` (os 5 últimos). A interface (`lib/game-storage.ts`) lê o banco ao abrir e envia cada alteração; na primeira abertura envia uma única vez o que o navegador já guardava (`localStorage`), então saves da versão 1.0.0 não se perdem. Sem servidor (`npm run dev`) ela volta a usar o `localStorage`.
- **Rodar a partir do código:** `npm start` compila a interface e sobe o servidor em http://127.0.0.1:34600 (banco em `apps/server/data/`, recursos em `./recursos`). Variáveis: `POKESIM_HOME`, `POKESIM_PORT`, `DB_PATH`, `RECURSOS_DIR`, `WEB_DIST`.
- **Gerar os pacotes:** com Node 22+ e Go 1.24+, `npm run build:release -- --recursos=./recursos` cria em `dist/release/` o `full` (pasta do jogo completa) e o `update`, cada um com `.sha256`. O launcher é compilado para Windows de qualquer sistema; o `node.exe` é baixado (e conferido) da mesma versão do Node que roda o script, ou use `--node=CAMINHO\node.exe`. Testes: `npm test` (interface + servidor) e `npm run test:launcher`.
- **Publicar uma versão:** aumente `version` em `package.json` (e `apps/web/package.json`), escreva `RELEASE_NOTES.md` e envie para a `main`. O GitHub Actions (`.github/workflows/release.yml`) testa, monta os pacotes (lendo `recursos` da branch `recursos`) e cria a release `vX.Y.Z`.
- O ícone e o manifesto do `.exe` vêm de `launcher/rsrc_windows_amd64.syso` (gerado por `go run ./tools/winres` dentro de `launcher/`).

## Batalhas

Treinadores e adversários de torneio usam nomes e sprites sorteados da mesma categoria de gênero. Na criação da jornada, a escolha de gênero filtra os sprites identificados e também permite os sprites sem categoria. O gênero acompanha os backups.

Ginásios usam os times do catálogo do Remake, com circuitos liberados após vencer o campeão anterior. Torneios individuais têm oito rodadas e retomam da rodada salva. Chefes são sorteados em grupos de seis a cada dez minutos. Os quatro modos usam a mesma tela de combate dos selvagens.

## Novo Jogo+ e modos de jogo

- **Novo Jogo+:** ao derrotar todos os campeões aparece o aviso "Jogo zerado!" (`progress.restart`, guardado no save: se a aba fechar antes da escolha, o aviso volta). O jogador escolhe um novo inicial entre os de **todas as gerações** e o save recomeça **do zero**: Pokémon, itens, dinheiro, missões, insígnias, ginásios e estatísticas são reiniciados (`restartJourney` em `lib/journey-saves.ts`). Ficam o modo de jogo, o tempo de jogo e `progress.cycle`, que conta quantas vezes o jogo foi zerado. Com o ciclo acima de 0 o limite de nível dos Pokémon some (selvagens, doces e evoluções liberados).
- **Iniciais:** numa jornada nova só os de Kanto (Gen 1) ficam disponíveis; os iniciais de todas as gerações são exclusivos do Novo Jogo+ (`firstJourneyGenerations` em `screens/starter-picker.tsx`; saves antigos mantêm a geração do inicial que já tinham).
- **Iniciais sempre 4★:** todo inicial nasce com IV 31 em tudo (100%); saves antigos têm o inicial corrigido ao carregar.
- **Escala pela média da equipe:** no Novo Jogo+ treinadores, ginásios (líder, Elite e campeão), chefes e a nova **Copa Evolution** (acima da Copa Prime) usam a média de nível da equipe somada a um ajuste (`scaleOffsets` em `lib/battle/challenges.ts`): treinadores por dificuldade (−10 a +5), líderes +0, Elite +3, campeão +6, chefes −10 a +15 conforme as estrelas, Copa Evolution +5.
- **Morte permanente:** modo escolhido ao criar a jornada (`progress.mode`). No fim da batalha, todo Pokémon derrotado é apagado; se a equipe ficar vazia, entra o de maior nível do PC. Sem nenhum Pokémon (equipe + PC) o save é excluído e aparece a tela de fim de jogo. O Pokémon apostado no cassino não é apagado pela batalha.

## Cassino

O cassino é um salão "Game Corner" com nove jogos (caça-níqueis, roleta, Voltorb Flip, Pokejack, Pokémon Race, Wheel of Fortune, Pula Piplup, Portas do Eevee e Duelo de Tipos). As regras ficam em `apps/web/src/lib/battle/casino-rules.ts`; `lib/casino.ts` sorteia o resultado de uma vez e devolve um `outcome` detalhado, que as telas em `screens/game/casino/` animam (estilos em `styles/casino.css`, fixos em todos os temas). Com "reduzir movimento" ativo as animações são puladas.

## Opções

A área **Opções** reúne as preferências, guardadas neste navegador e valendo para todos os saves:

- **Tema:** Automático (segue o claro/escuro do sistema), Floresta, Oceano, Vulcão, Elétrico e Noturno. As cores de `globals.css` são variáveis; as dos demais arquivos de estilo são trocadas em tempo de build pelo plugin PostCSS `theme-css.ts`, que envolve cada cor (hexadecimal ou `rgb()`/`rgba()`) em `var(--c-…)` e gera as variações de cada tema (os `.css` continuam escritos com cores normais). Uma regra com `--theme-keep: 1` mantém as próprias cores (a legenda sobre a foto da capa) e um `.css` que começa com o comentário `theme-css: off` não muda de tema (a cena da batalha).
- **Velocidade do texto** (Lenta, Normal, Rápida, Instantânea: o texto das batalhas é digitado letra por letra e o próximo aviso espera o anterior terminar) e **velocidade das animações** (afeta os golpes na batalha e, pelo mesmo plugin, as transições e animações CSS).
- **Rádio:** toca em ordem aleatória, sem repetir a faixa anterior, as músicas de `recursos/Sons/Musicas` (arquivos menores que ~100 KB são tratados como vinhetas e ficam de fora). Tem volume e "Próxima". O navegador só libera o som depois do primeiro clique ou tecla.
- **Efeitos sonoros:** liga/desliga e volume dos sons de `recursos/Sons/Efeitos`: música de abertura da batalha, captura de um Pokémon e nascimento de um brilhante (shiny). Durante a batalha a rádio cai para 10% (ou menos, se o volume dela já for menor) e volta ao normal quando a batalha acaba.
- **Player de vídeo:** painel do YouTube no canto da tela (links de vídeo, live, short ou playlist), ligado e desligado aqui.
- **Controles:** teclas de andar/interagir/capturar nos Selvagens, teclas da batalha e atalhos Ctrl/⌘ do menu. Clique na tecla e aperte a nova; se ela já tinha dono, as duas ações trocam. `Ctrl T/W/N/C/V/Z` são recusadas (reservadas pelo navegador ou pelo texto). Setas e Enter continuam funcionando ao explorar.

`npm test` roda os testes unitários da interface e do servidor (`node --test`).
