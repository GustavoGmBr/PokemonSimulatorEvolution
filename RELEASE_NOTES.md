## Pokémon Simulator Evolution 1.2.0

### Como instalar

Baixe **`PokemonSimulatorEvolution-v1.2.0-full-win-x64.zip`**, extraia onde quiser e abra `PokemonSimulatorEvolution.exe`. Quem já tem a 1.1.0 recebe esta versão pela atualização automática do `.exe` (saves e `recursos/` não são mexidos).

(`PokemonSimulatorEvolution-v1.2.0-update-win-x64.zip` é o pacote que a atualização automática baixa; não precisa baixá-lo à mão.)

### Como funciona

- Ao abrir, o `.exe` atualiza o jogo se houver versão nova, abre o navegador em **http://127.0.0.1:34600** (a mesma porta do Pokémon Simulator Remake; se estiver ocupada, usa a próxima livre) e fica escondido na **bandeja do Windows**.
- Clique no ícone da bandeja para abrir o jogo; com o botão direito: atualizar, "Iniciar com o Windows", abrir as pastas de recursos, saves e logs, sair.
- Só uma cópia roda por vez; abrir o `.exe` de novo apenas reabre o jogo no navegador.
- Atualizações vêm destas Releases, com conferência de integridade (SHA-256); o `.exe` verifica a cada 6 horas e avisa na bandeja. A atualização troca só o `.exe` e a pasta `app/`: saves e `recursos/` ficam como estão.
- Opções de linha de comando: `--no-update`, `--background` (não abre o navegador) e `--stop` (encerra o jogo aberto).

### Novidades

- **Música de batalha:** ao começar uma batalha toca a abertura (`pokemon-battle.mp3`) e a rádio cai para **10%** enquanto você luta; ao sair da batalha o volume volta ao que estava.
- **Som de captura:** toca quando uma Poké Bola captura o Pokémon, nos Selvagens e nas batalhas.
- **Som de shiny:** toca quando um Pokémon brilhante aparece.
- **Opções › Efeitos sonoros:** liga/desliga e volume próprio dos efeitos (a rádio continua com o volume dela).
- **Temas legíveis:** os textos sumiam ao trocar de tema porque as cores `rgb()`/`rgba()` não eram trocadas junto com as demais (fundos mudavam, o texto ficava igual). Agora todas entram no tema. A tela de batalha (nome do adversário, teclas de atalho Q/W/E/R e 1–4) e a legenda da capa ficam sempre legíveis, as estrelas de 4★ ficam mais claras no Noturno e o texto secundário do Elétrico ficou mais escuro.

### Sobre os sons

Os arquivos ficam em `recursos/Sons/Efeitos` (já incluídos no pacote completo). O navegador só libera o som depois do primeiro clique ou tecla na página.

### Novidades anteriores (1.1.0)

- Saves em banco SQLite (`saves/game.db`), com cópia automática em `saves/backups/`; seus saves da 1.0.0 são migrados na primeira abertura.
- Mesma arquitetura do jogo antigo: launcher na bandeja + Node.js embutido + servidor local.
- Numa jornada nova só dá para escolher os iniciais de Kanto; os de todas as gerações são liberados no Novo Jogo+.

### Segurança da atualização

O launcher só aceita atualizações que tenham o arquivo `.sha256` correspondente, recusa pacotes com arquivos fora de `app/` e troca os arquivos sem apagar `recursos/` nem `saves/`.
