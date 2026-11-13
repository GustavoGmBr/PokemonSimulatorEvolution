package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	appID = "pokesim-evolution"
	// Mesma porta preferida do jogo antigo (Pokémon Simulator Remake): o jogo sempre abre em http://127.0.0.1:34600
	// e não disputa porta com outros sistemas. Se outro programa a ocupa, o servidor usa a próxima livre.
	preferredPort = 34600
	portAttempts  = 50
)

// O servidor do jogo (app/server.mjs) imprime esta linha quando está pronto.
var readyPattern = regexp.MustCompile(`Jogo pronto: http://127\.0\.0\.1:(\d+)/`)

// findNode procura o Node.js: o do pacote (runtime/node.exe) e, em desenvolvimento, o instalado no sistema.
func findNode(root string) (string, error) {
	candidates := []string{os.Getenv("POKESIM_NODE"), filepath.Join(root, "runtime", "node.exe"), filepath.Join(root, "runtime", "node")}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	if path, err := exec.LookPath("node"); err == nil {
		return path, nil
	}
	return "", errors.New("o Node.js do pacote (runtime\\node.exe) não foi encontrado")
}

// gameServer é o processo Node que serve a interface, os recursos e grava os saves no SQLite.
type gameServer struct {
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	port     int
	done     chan struct{} // fechado quando o processo termina
	stopping bool
	clean    bool // terminou com código 0 (ex.: pelo --stop, que o servidor atende sozinho)
	mu       sync.Mutex
}

type serverConfig struct {
	root     string // pasta do jogo (POKESIM_HOME): app/, saves/, recursos/
	recursos string // pasta recursos/ se estiver fora de root
	log      func(string, ...any)
}

func startServer(c serverConfig) (*gameServer, error) {
	node, err := findNode(c.root)
	if err != nil {
		return nil, err
	}
	script := filepath.Join(c.root, "app", "server.mjs")
	if _, err := os.Stat(script); err != nil {
		return nil, fmt.Errorf("arquivo do jogo ausente: %s", script)
	}
	cmd := exec.Command(node, "--disable-warning=ExperimentalWarning", script)
	cmd.Dir = c.root
	cmd.Env = append(os.Environ(), "POKESIM_HOME="+c.root, "POKESIM_GUI=1")
	if c.recursos != "" && filepath.Clean(c.recursos) != filepath.Join(c.root, "recursos") {
		cmd.Env = append(cmd.Env, "RECURSOS_DIR="+c.recursos)
	}
	hideWindow(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	g := &gameServer{cmd: cmd, stdin: stdin, done: make(chan struct{})}
	ready := make(chan int, 1)
	var tail struct {
		sync.Mutex
		lines []string
	}
	scan := func(r io.Reader) {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text()
			c.log("servidor: %s", line)
			tail.Lock()
			tail.lines = append(tail.lines, line)
			if len(tail.lines) > 6 {
				tail.lines = tail.lines[1:]
			}
			tail.Unlock()
			if m := readyPattern.FindStringSubmatch(line); m != nil {
				if port, err := strconv.Atoi(m[1]); err == nil {
					select {
					case ready <- port:
					default:
					}
				}
			}
		}
	}
	var readers sync.WaitGroup
	for _, r := range []io.Reader{stdout, stderr} {
		readers.Add(1)
		go func(r io.Reader) { defer readers.Done(); scan(r) }(r)
	}
	go func() {
		readers.Wait()
		err := cmd.Wait()
		g.mu.Lock()
		g.clean = err == nil
		g.mu.Unlock()
		close(g.done)
	}()

	select {
	case port := <-ready:
		g.port = port
		return g, nil
	case <-g.done:
		tail.Lock()
		defer tail.Unlock()
		return nil, fmt.Errorf("o servidor do jogo encerrou ao iniciar: %s", strings.Join(tail.lines, " | "))
	case <-time.After(45 * time.Second):
		g.kill()
		return nil, errors.New("o servidor do jogo demorou demais para iniciar")
	}
}

func (g *gameServer) kill() {
	if g.cmd.Process != nil {
		_ = g.cmd.Process.Kill()
	}
}

// exited avisa (uma vez) se o servidor terminou sem que o launcher tivesse pedido.
func (g *gameServer) exited() <-chan struct{} { return g.done }

// wasStopped diz se o encerramento foi esperado (pedido pelo launcher ou saída normal do servidor).
func (g *gameServer) wasStopped() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.stopping || g.clean
}

// stop pede ao servidor que feche o banco e encerre; se não obedecer em alguns segundos, o processo é morto.
func (g *gameServer) stop() {
	g.mu.Lock()
	g.stopping = true
	g.mu.Unlock()
	_, _ = io.WriteString(g.stdin, "stop\n")
	_ = g.stdin.Close()
	select {
	case <-g.done:
	case <-time.After(8 * time.Second):
		g.kill()
		<-g.done
	}
}
