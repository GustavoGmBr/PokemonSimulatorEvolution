// Launcher do Pokémon Simulator Evolution: serve o jogo em http://127.0.0.1:34600, fica na bandeja do Windows
// (sem janela) e se atualiza pelas Releases do GitHub. As imagens e músicas vêm da pasta recursos/ ao lado do executável.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
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
	cmdLogs
	cmdQuit
)

type app struct {
	opts     options
	exe      string
	dir      string
	recursos string
	port     int
	logger   *log.Logger
	upd      *updater
	httpSrv  *http.Server

	mu      sync.Mutex
	pending *ghRelease // atualização encontrada e ainda não instalada
	busy    bool
	notice  string
}

func (a *app) url() string { return "http://127.0.0.1:" + strconv.Itoa(a.port) + "/" }

func (a *app) logf(format string, args ...any) { a.logger.Printf(format, args...) }

func (a *app) openGame() {
	if err := openTarget(a.url()); err != nil {
		a.logf("não foi possível abrir o navegador: %v", err)
		trayNotify("Pokémon Simulator Evolution", "Abra no navegador: "+a.url())
	}
}

func (a *app) tooltip() string {
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

	ctx, cancel := withTimeout(300)
	defer cancel()
	latest, installed, err := a.upd.check(ctx, true)
	switch {
	case err != nil:
		a.logf("atualização: %v", err)
		trayNotify("Pokémon Simulator Evolution", "Não foi possível atualizar agora. Veja o log.")
	case !installed:
		trayNotify("Pokémon Simulator Evolution", "Você já está na versão mais recente ("+version+").")
	default:
		a.relaunch(latest)
	}
}

// relaunch inicia a versão nova e encerra esta.
func (a *app) relaunch(latest string) {
	args := []string{"--updated"}
	if a.opts.background || a.opts.noBrowser {
		args = append(args, "--no-browser")
	}
	if a.opts.recursos != "" {
		args = append(args, "--recursos="+a.opts.recursos)
	}
	trayNotify("Pokémon Simulator Evolution", "Atualizado para a versão "+latest+". Reiniciando…")
	if err := restart(a.exe, args...); err != nil {
		a.logf("não foi possível reiniciar: %v", err)
		trayNotify("Pokémon Simulator Evolution", "Atualizado para "+latest+". Abra o programa de novo.")
	}
	trayQuit()
}

// startup procura atualização antes de abrir o navegador (para o jogador não abrir a versão velha) e abre o jogo.
func (a *app) startup() {
	if a.updatesEnabled() && !a.opts.updated {
		ctx, cancel := withTimeout(20)
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

	a := &app{opts: opts, exe: exe, dir: dir, logger: logger}
	a.recursos = findRecursos(opts.recursos, filepath.Dir(exe))
	logger.Printf("recursos: %q", a.recursos)
	a.upd = &updater{exe: exe, log: logger.Printf}
	a.upd.installed, _ = parseSemver(version)

	srv, err := newServer(a.recursos, trayQuit)
	if err != nil {
		showError("Pokémon Simulator Evolution", err.Error())
		os.Exit(1)
	}
	listener, port, err := listen(preferredPort)
	if err != nil {
		logger.Printf("sem porta livre: %v", err)
		showError("Pokémon Simulator Evolution", "Não encontrei uma porta livre entre "+strconv.Itoa(preferredPort)+" e "+strconv.Itoa(preferredPort+portAttempts-1)+".")
		os.Exit(1)
	}
	a.port, srv.port = port, port
	if port != preferredPort {
		logger.Printf("porta %d em uso; usando %d (os saves ficam por endereço no navegador)", preferredPort, port)
	}
	a.httpSrv = httpServer(srv)
	go func() {
		if err := a.httpSrv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Printf("servidor: %v", err)
		}
	}()
	logger.Printf("jogo pronto: %s", a.url())

	go a.startup()
	runTray(a) // bloqueia até "Sair"
	_ = a.httpSrv.Close()
	logger.Printf("encerrado")
}
