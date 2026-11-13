package main

import (
	"embed"
	"encoding/json"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// O jogo compilado (apps/web/dist) é copiado para launcher/web antes do `go build`: o .exe leva a interface dentro dele.
//
//go:embed all:web
var webFiles embed.FS

const (
	appID = "pokesim-evolution"
	// Mesma porta preferida do jogo antigo (Pokémon Simulator Remake): o navegador guarda os saves por endereço,
	// então o jogo sempre abre em http://127.0.0.1:34600 e não disputa porta com outros sistemas.
	preferredPort = 34600
	portAttempts  = 50
	// Faixas menores que isto são vinhetas de poucos segundos (item obtido, subir de nível…) e ficam fora do rádio.
	minMusicSize = 100_000
)

// Pastas de recursos/ servidas em /recursos/ e as extensões permitidas em cada uma
// (a mesma lista de apps/web/vite.config.ts, usada por `npm run dev`).
var publicFolders = map[string][]string{
	"Pokemons":    {".png"},
	"Shinys":      {".png"},
	"Mapas":       {".png"},
	"Arenas":      {".png"},
	"Pokebolas":   {".png"},
	"Itens":       {".png"},
	"Treinadores": {".png"},
	"Sons":        {".mp3"},
}

var contentTypes = map[string]string{
	".html":  "text/html; charset=utf-8",
	".js":    "text/javascript; charset=utf-8",
	".mjs":   "text/javascript; charset=utf-8",
	".css":   "text/css; charset=utf-8",
	".json":  "application/json; charset=utf-8",
	".svg":   "image/svg+xml",
	".png":   "image/png",
	".webp":  "image/webp",
	".ico":   "image/x-icon",
	".woff2": "font/woff2",
	".woff":  "font/woff",
	".txt":   "text/plain; charset=utf-8",
	".map":   "application/json; charset=utf-8",
	".mp3":   "audio/mpeg",
}

func contentType(name string) string {
	ext := strings.ToLower(path.Ext(name))
	if value, ok := contentTypes[ext]; ok {
		return value
	}
	if value := mime.TypeByExtension(ext); value != "" {
		return value
	}
	return "application/octet-stream"
}

type server struct {
	recursos string // pasta recursos/ no disco ("" se não foi encontrada)
	web      fs.FS
	onStop   func()
	port     int
}

func newServer(recursos string, onStop func()) (*server, error) {
	web, err := fs.Sub(webFiles, "web")
	if err != nil {
		return nil, err
	}
	return &server{recursos: recursos, web: web, onStop: onStop}, nil
}

// Aceita só pedidos feitos ao endereço local (evita que outro site use o nome dele para falar com o servidor).
func (s *server) hostAllowed(host string) bool {
	name, _, err := net.SplitHostPort(host)
	if err != nil {
		name = host
	}
	return name == "127.0.0.1" || name == "localhost" || name == "[::1]" || name == "::1"
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !s.hostAllowed(r.Host) {
		http.Error(w, "host não permitido", http.StatusMisdirectedRequest)
		return
	}
	switch {
	case r.URL.Path == "/_/sair":
		// Usado por `--stop`; o cabeçalho próprio impede que uma página qualquer dispare isso (exigiria CORS).
		if r.Method != http.MethodPost || r.Header.Get("X-Pokesim") != "stop" {
			http.Error(w, "não permitido", http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		if s.onStop != nil {
			go s.onStop()
		}
	case r.Method != http.MethodGet && r.Method != http.MethodHead:
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
	case r.URL.Path == "/_/versao":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(map[string]any{"app": appID, "version": version, "recursos": s.recursos != "", "port": s.port})
	case strings.HasPrefix(r.URL.Path, "/recursos/"):
		s.serveRecursos(w, r, strings.TrimPrefix(r.URL.Path, "/recursos/"))
	default:
		s.serveWeb(w, r)
	}
}

// ---- recursos/ ----

var musicPrefix = regexp.MustCompile(`^\d+\s*-\s*`)

type track struct {
	File  string `json:"file"`
	Title string `json:"title"`
}

// "03 - Pallet Town.mp3" → "Pallet Town".
func musicTitle(file string) string {
	name := strings.TrimSuffix(file, path.Ext(file))
	return strings.TrimSpace(musicPrefix.ReplaceAllString(name, ""))
}

func (s *server) musicList() []track {
	list := []track{}
	if s.recursos == "" {
		return list
	}
	dir := filepath.Join(s.recursos, "Sons", "Musicas")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return list
	}
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || !strings.EqualFold(path.Ext(entry.Name()), ".mp3") || info.Size() < minMusicSize {
			continue
		}
		list = append(list, track{File: entry.Name(), Title: musicTitle(entry.Name())})
	}
	sort.Slice(list, func(a, b int) bool { return list[a].File < list[b].File })
	return list
}

func (s *server) pngList(folder string) []string {
	list := []string{}
	if s.recursos == "" {
		return list
	}
	entries, err := os.ReadDir(filepath.Join(s.recursos, folder))
	if err != nil {
		return list
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.EqualFold(path.Ext(entry.Name()), ".png") {
			list = append(list, entry.Name())
		}
	}
	sort.Strings(list)
	return list
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_ = json.NewEncoder(w).Encode(value)
}

func (s *server) serveRecursos(w http.ResponseWriter, r *http.Request, rel string) {
	switch rel {
	case "Sons/Musicas/lista.json":
		writeJSON(w, s.musicList())
		return
	case "Treinadores/lista.json":
		writeJSON(w, s.pngList("Treinadores"))
		return
	}
	clean := path.Clean("/" + rel)[1:]
	folder, _, found := strings.Cut(clean, "/")
	extensions, allowed := publicFolders[folder]
	if s.recursos == "" || !found || !allowed || clean != rel || !hasExtension(clean, extensions) {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join(s.recursos, filepath.FromSlash(clean))
	if inside, err := filepath.Rel(s.recursos, full); err != nil || strings.HasPrefix(inside, "..") {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType(clean))
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, info.Name(), info.ModTime(), file) // trata Range (as músicas precisam para avançar a faixa)
}

func hasExtension(name string, extensions []string) bool {
	ext := strings.ToLower(path.Ext(name))
	for _, allowed := range extensions {
		if ext == allowed {
			return true
		}
	}
	return false
}

// ---- interface (embutida) ----

func (s *server) serveWeb(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "" {
		name = "index.html"
	}
	data, err := fs.ReadFile(s.web, name)
	if err != nil {
		if path.Ext(name) != "" {
			http.NotFound(w, r)
			return
		}
		name = "index.html" // rotas sem arquivo caem na interface (a navegação do jogo usa #/…)
		if data, err = fs.ReadFile(s.web, name); err != nil {
			http.Error(w, "interface não encontrada neste executável", http.StatusInternalServerError)
			return
		}
	}
	w.Header().Set("Content-Type", contentType(name))
	if strings.HasPrefix(name, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable") // nomes com hash do conteúdo
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	if r.Method == http.MethodHead {
		return
	}
	_, _ = io.Copy(w, bytesReader(data))
}

// ---- porta ----

// listen usa a porta padrão (os saves ficam no navegador, por endereço); se outro programa a ocupa, usa a próxima livre.
func listen(first int) (net.Listener, int, error) {
	var last error
	for port := first; port < first+portAttempts; port++ {
		listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
		if err == nil {
			return listener, port, nil
		}
		last = err
	}
	return nil, 0, last
}

func httpServer(handler http.Handler) *http.Server {
	return &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second}
}
