// Launcher do Pokémon Simulator Evolution: inicia o servidor do jogo (Node.js embutido + SQLite) em http://127.0.0.1:34600,
// fica na bandeja do Windows (sem janela) e se atualiza pelas Releases do GitHub. Mesmo esquema do Pokémon Simulator Remake:
//
//	PokemonSimulatorEvolution.exe   este programa
//	runtime\node.exe                Node.js (o jogador não instala nada)
//	app\server.mjs, app\web\         servidor do jogo e interface
//	recursos\                       imagens e músicas
//	saves\game.db                   banco SQLite com os saves (backups em saves\backups)
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Definida na compilação: go build -ldflags "-X main.version=1.0.0".
var version = "dev"

const updateEvery = 6 * time.Hour

type options struct {
	background bool   // não abre o navegador (usado ao iniciar com o Windows)
	noBrowser  bool   // idem, mas também depois de atualizar
	noUpdate   bool   // não procura atualizações
	stop       bool   // encerra o jogo que já está aberto
	updated    bool   // iniciado pela atualização: espera a instância antiga terminar
	recursos   string // pasta recursos/ (padrão: ao lado do executável)
}

func parseOptions(args []string) options {
	var o options
	set := flag.NewFlagSet("PokemonSimulatorEvolution", flag.ContinueOnError)
	set.SetOutput(&bytes.Buffer{})
	set.BoolVar(&o.background, "background", false, "")
	set.BoolVar(&o.noBrowser, "no-browser", false, "")
	set.BoolVar(&o.noUpdate, "no-update", false, "")
	set.BoolVar(&o.stop, "stop", false, "")
	set.BoolVar(&o.updated, "updated", false, "")
	set.StringVar(&o.recursos, "recursos", "", "")
	_ = set.Parse(args)
	if os.Getenv("POKESIM_NO_BROWSER") == "1" {
		o.noBrowser = true
	}
	if os.Getenv("POKESIM_NO_UPDATE") == "1" {
		o.noUpdate = true
	}
	return o
}

// findRecursos procura a pasta recursos/: opção --recursos, variável POKESIM_RECURSOS e, por fim, ao lado do executável
// (ou até duas pastas acima, para quando o .exe fica numa subpasta do projeto).
func findRecursos(explicit, exeDir string) string {
	candidates := []string{explicit, os.Getenv("POKESIM_RECURSOS")}
	dir := exeDir
	for i := 0; i < 3; i++ {
		candidates = append(candidates, filepath.Join(dir, "recursos"))
		dir = filepath.Dir(dir)
	}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			abs, err := filepath.Abs(candidate)
			if err != nil {
				return candidate
			}
			return abs
		}
	}
	return ""
}

func dataDir() string {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "PokemonSimulatorEvolution")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

func openLog(dir string) *log.Logger {
	path := filepath.Join(dir, "launcher.log")
	if info, err := os.Stat(path); err == nil && info.Size() > 512<<10 {
		_ = os.Remove(path)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return log.New(os.Stderr, "", log.LstdFlags)
	}
	return log.New(file, "", log.LstdFlags)
}

// stopRunning pede ao jogo aberto (em qualquer porta do intervalo) que se encerre.
func stopRunning() bool {
	stopped := false
	for port := preferredPort; port < preferredPort+portAttempts; port++ {
		if !isOurServer(port) {
			continue
		}
		request, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/_/sair", port), nil)
		request.Header.Set("X-Pokesim", "stop")
		if response, err := (&http.Client{Timeout: 3 * time.Second}).Do(request); err == nil {
			response.Body.Close()
			stopped = true
		}
	}
	return stopped
}

// isOurServer diz se já há um Pokémon Simulator Evolution respondendo nesta porta.
func isOurServer(port int) bool {
	client := &http.Client{Timeout: 700 * time.Millisecond}
	response, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/_/versao", port))
	if err != nil {
		return false
	}
	defer response.Body.Close()
	var info struct {
		App string `json:"app"`
	}
	return json.NewDecoder(response.Body).Decode(&info) == nil && info.App == appID
}

func runningPort() int {
	for port := preferredPort; port < preferredPort+portAttempts; port++ {
		if isOurServer(port) {
			return port
		}
	}
	return 0
}

// ---- estado do programa ----

type menuItem struct {
	id                         int
	text                       string
	checked, disabled, divider bool
}

const (
	cmdTitle = iota + 100
	cmdOpen
	cmdUpdate
	cmdAutostart
	cmdRecursos
	cmdSaves
	cmdLogs
	cmdQuit
)

type app struct {
	opts     options
	exe      string
	root     string // pasta do jogo (onde está o .exe)
	dir      string // logs
	recursos string
	port     int
	logger   *log.Logger
	upd      *updater

	game *gameServer

	mu      sync.Mutex
	pending *ghRelease // atualização encontrada e ainda não instalada
	busy    bool
	notice  string
}

func (a *app) url() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return "http://127.0.0.1:" + strconv.Itoa(a.port) + "/"
}

func (a *app) running() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.port != 0
}

func (a *app) logf(format string, args ...any) { a.logger.Printf(format, args...) }

func (a *app) openGame() {
	if !a.running() {
		trayNotify("Pokémon Simulator Evolution", "O jogo ainda está iniciando…")
		return
	}
	if err := openTarget(a.url()); err != nil {
		a.logf("não foi possível abrir o navegador: %v", err)
		trayNotify("Pokémon Simulator Evolution", "Abra no navegador: "+a.url())
	}
}

func (a *app) tooltip() string {
	if !a.running() {
		return "Pokémon Simulator Evolution — iniciando…"
	}
	text := "Pokémon Simulator Evolution — " + strings.TrimPrefix(a.url(), "http://")
	if a.port != preferredPort {
		text += " (porta " + strconv.Itoa(preferredPort) + " em uso)"
	}
	return text
}

func (a *app) updatesEnabled() bool {
	_, ok := parseSemver(version)
	return ok && !a.opts.noUpdate
}

func (a *app) menu() []menuItem {
	a.mu.Lock()
	pending, busy := a.pending, a.busy
	a.mu.Unlock()
	update := menuItem{id: cmdUpdate, text: "Verificar atualizações", disabled: !a.updatesEnabled() || busy}
	if pending != nil {
		update.text = "Atualizar para " + pending.Tag
	}
	if busy {
		update.text = "Atualizando…"
	}
	recursos := menuItem{id: cmdRecursos, text: "Abrir a pasta de recursos"}
	if a.recursos == "" {
		recursos.text = "Pasta de recursos não encontrada"
		recursos.disabled = true
	}
	return []menuItem{
		{id: cmdTitle, text: "Pokémon Simulator Evolution " + strings.TrimPrefix(version, "v"), disabled: true},
		{id: cmdOpen, text: "Abrir o jogo"},
		update,
		{divider: true},
		{id: cmdAutostart, text: "Iniciar com o Windows", checked: autostartEnabled()},
		recursos,
		{id: cmdSaves, text: "Abrir a pasta dos saves"},
		{id: cmdLogs, text: "Abrir a pasta de logs"},
		{divider: true},
		{id: cmdQuit, text: "Sair"},
	}
}

func (a *app) handle(id int) {
	switch id {
	case cmdOpen:
		a.openGame()
	case cmdUpdate:
		a.updateNow()
	case cmdAutostart:
		if err := setAutostart(!autostartEnabled(), a.exe); err != nil {
			a.logf("iniciar com o Windows: %v", err)
			trayNotify("Pokémon Simulator Evolution", "Não foi possível alterar a inicialização com o Windows.")
		}
	case cmdRecursos:
		if a.recursos != "" {
			_ = openTarget(a.recursos)
		}
	case cmdSaves:
		saves := filepath.Join(a.root, "saves")
		_ = os.MkdirAll(saves, 0o755)
		_ = openTarget(saves)
	case cmdLogs:
		_ = openTarget(a.dir)
	case cmdQuit:
		trayQuit()
	}
}

// updateNow instala a atualização já encontrada, ou procura uma e instala.
func (a *app) updateNow() {
	if !a.updatesEnabled() {
		return
	}
	a.mu.Lock()
	if a.busy {
		a.mu.Unlock()
		return
	}
	a.busy = true
	a.mu.Unlock()
	defer func() { a.mu.Lock(); a.busy = false; a.mu.Unlock() }()

	ctx, cancel := withTimeout(600)
	defer cancel()
	stopped := false
	a.upd.beforeApply = func() { stopped = true; a.stopGame() }
	latest, installed, err := a.upd.check(ctx, true)
	switch {
	case err != nil:
		a.logf("atualização: %v", err)
		trayNotify("Pokémon Simulator Evolution", "Não foi possível atualizar agora. Veja o log.")
		if stopped { // a troca falhou depois de parar o jogo: volta a abri-lo
			a.startGame()
		}
	case !installed:
		trayNotify("Pokémon Simulator Evolution", "Você já está na versão mais recente ("+version+").")
	default:
		a.relaunch(latest)
	}
}

// relaunch inicia a versão nova e encerra esta (o servidor já foi parado antes de trocar os arquivos).
func (a *app) relaunch(latest string) {
	args := []string{"--updated"}
	if a.opts.background || a.opts.noBrowser {
		args = append(args, "--no-browser")
	}
	if a.opts.recursos != "" {
		args = append(args, "--recursos="+a.opts.recursos)
	}
	trayNotify("Pokémon Simulator Evolution", "Atualizado para a versão "+latest+". Reiniciando…")
	a.stopGame()
	if err := restart(a.exe, args...); err != nil {
		a.logf("não foi possível reiniciar: %v", err)
		trayNotify("Pokémon Simulator Evolution", "Atualizado para "+latest+". Abra o programa de novo.")
	}
	trayQuit()
}

// startGame sobe o servidor do jogo (Node + SQLite) e guarda a porta em que ele ficou.
func (a *app) startGame() bool {
	game, err := startServer(serverConfig{root: a.root, recursos: a.recursos, log: a.logf})
	if err != nil {
		a.logf("não foi possível iniciar o jogo: %v", err)
		showError("Pokémon Simulator Evolution", "Não foi possível iniciar o jogo.\n\n"+err.Error()+"\n\nVeja o log em "+filepath.Join(a.dir, "launcher.log"))
		return false
	}
	a.mu.Lock()
	a.game, a.port = game, game.port
	a.mu.Unlock()
	if game.port != preferredPort {
		a.logf("porta %d em uso; usando %d", preferredPort, game.port)
	}
	a.logf("jogo pronto: %s", a.url())
	go func() {
		<-game.exited()
		if !game.wasStopped() {
			a.logf("o servidor do jogo parou sozinho")
			showError("Pokémon Simulator Evolution", "O servidor do jogo parou inesperadamente. Abra o programa de novo; seus saves estão em saves\\game.db.")
			trayQuit()
		}
	}()
	return true
}

// stopGame fecha o servidor (e o banco) com calma.
func (a *app) stopGame() {
	a.mu.Lock()
	game := a.game
	a.game, a.port = nil, 0
	a.mu.Unlock()
	if game != nil {
		game.stop()
	}
}

// startup procura atualização antes de iniciar o jogo (para o jogador não abrir a versão velha), inicia o servidor e abre o navegador.
func (a *app) startup() {
	if a.updatesEnabled() && !a.opts.updated {
		ctx, cancel := withTimeout(120)
		latest, installed, err := a.upd.check(ctx, true)
		cancel()
		switch {
		case err != nil:
			a.logf("atualização: %v", err) // sem internet: segue com a versão instalada
		case installed:
			a.relaunch(latest)
			return
		}
	}
	if !a.startGame() {
		trayQuit()
		return
	}
	if !a.opts.background && !a.opts.noBrowser {
		a.openGame()
	}
	a.watchForUpdates()
}

// watchForUpdates procura de tempos em tempos; se houver, avisa no menu (instalar reinicia o jogo, então fica por conta do jogador).
func (a *app) watchForUpdates() {
	if !a.updatesEnabled() {
		return
	}
	for {
		time.Sleep(updateEvery)
		ctx, cancel := withTimeout(30)
		release, latest, ok, err := a.upd.available(ctx)
		cancel()
		if err != nil || !ok {
			continue
		}
		a.mu.Lock()
		already := a.pending != nil && a.pending.Tag == release.Tag
		a.pending = &release
		a.mu.Unlock()
		if !already {
			trayNotify("Pokémon Simulator Evolution", "Versão "+latest.String()+" disponível. Clique no ícone da bandeja para atualizar.")
		}
	}
}

func main() {
	opts := parseOptions(os.Args[1:])
	if opts.stop {
		if !stopRunning() {
			showError("Pokémon Simulator Evolution", "O jogo não está aberto.")
		}
		return
	}

	exe, err := os.Executable()
	if err != nil {
		showError("Pokémon Simulator Evolution", err.Error())
		os.Exit(1)
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	dir := dataDir()
	logger := openLog(dir)
	logger.Printf("iniciando %s (%s)", version, exe)
	_ = os.Remove(exe + ".old")
	_ = os.Remove(exe + ".new")

	wait := time.Duration(0)
	if opts.updated {
		wait = 20 * time.Second // a versão antiga ainda está fechando
	}
	releaseInstance, ok := acquireInstance(wait)
	if !ok {
		// Já está aberto: só abre o jogo no navegador.
		if port := runningPort(); port != 0 && !opts.background && !opts.noBrowser {
			_ = openTarget("http://127.0.0.1:" + strconv.Itoa(port) + "/")
		}
		return
	}
	defer releaseInstance()

	a := &app{opts: opts, exe: exe, root: filepath.Dir(exe), dir: dir, logger: logger}
	if home := os.Getenv("POKESIM_HOME"); home != "" {
		a.root = home
	}
	a.recursos = findRecursos(opts.recursos, a.root)
	logger.Printf("pasta do jogo: %q; recursos: %q", a.root, a.recursos)
	a.upd = &updater{exe: exe, root: a.root, log: logger.Printf}
	a.upd.installed, _ = parseSemver(version)

	go a.startup()
	runTray(a) // bloqueia até "Sair"
	a.stopGame()
	logger.Printf("encerrado")
}
