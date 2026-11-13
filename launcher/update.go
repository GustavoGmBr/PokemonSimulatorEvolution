package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	repository = "GustavoGmBr/PokemonSimulatorEvolution"
	assetName  = "PokemonSimulatorEvolution.exe"
)

// Endereço da API do GitHub (pode ser trocado em testes por POKESIM_UPDATE_API).
func updateAPI() string {
	if value := os.Getenv("POKESIM_UPDATE_API"); value != "" {
		return strings.TrimRight(value, "/")
	}
	return "https://api.github.com"
}

// ---- versões (1.2.3 ou 1.2.3-beta.1) ----

type semver struct {
	major, minor, patch int
	pre                 []string
}

var semverPattern = regexp.MustCompile(`^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?$`)

func parseSemver(text string) (semver, bool) {
	m := semverPattern.FindStringSubmatch(strings.TrimPrefix(text, "v"))
	if m == nil {
		return semver{}, false
	}
	v := semver{}
	v.major, _ = strconv.Atoi(m[1])
	v.minor, _ = strconv.Atoi(m[2])
	v.patch, _ = strconv.Atoi(m[3])
	if m[4] != "" {
		v.pre = strings.Split(m[4], ".")
	}
	return v, true
}

func (v semver) String() string {
	text := fmt.Sprintf("%d.%d.%d", v.major, v.minor, v.patch)
	if len(v.pre) > 0 {
		text += "-" + strings.Join(v.pre, ".")
	}
	return text
}

func compareInts(a, b int) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

// compare devolve -1, 0 ou 1. Uma versão sem sufixo (1.0.0) é maior que a de pré-lançamento (1.0.0-beta).
func (v semver) compare(o semver) int {
	for _, c := range []int{compareInts(v.major, o.major), compareInts(v.minor, o.minor), compareInts(v.patch, o.patch)} {
		if c != 0 {
			return c
		}
	}
	switch {
	case len(v.pre) == 0 && len(o.pre) == 0:
		return 0
	case len(v.pre) == 0:
		return 1
	case len(o.pre) == 0:
		return -1
	}
	for i := 0; i < len(v.pre) && i < len(o.pre); i++ {
		a, aErr := strconv.Atoi(v.pre[i])
		b, bErr := strconv.Atoi(o.pre[i])
		switch {
		case aErr == nil && bErr == nil:
			if c := compareInts(a, b); c != 0 {
				return c
			}
		case aErr == nil:
			return -1
		case bErr == nil:
			return 1
		default:
			if c := strings.Compare(v.pre[i], o.pre[i]); c != 0 {
				return c
			}
		}
	}
	return compareInts(len(v.pre), len(o.pre))
}

// ---- releases do GitHub ----

type ghAsset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

type ghRelease struct {
	Tag        string    `json:"tag_name"`
	Draft      bool      `json:"draft"`
	Prerelease bool      `json:"prerelease"`
	Assets     []ghAsset `json:"assets"`
}

// pickRelease escolhe a release mais nova que a instalada e que já tem o executável e o checksum.
// Quem usa uma versão estável só recebe estáveis; quem usa um pré-lançamento recebe também os pré-lançamentos.
func pickRelease(releases []ghRelease, installed semver) (ghRelease, semver, bool) {
	best := installed
	var chosen ghRelease
	found := false
	for _, release := range releases {
		if release.Draft || !strings.HasPrefix(release.Tag, "v") {
			continue
		}
		candidate, ok := parseSemver(release.Tag)
		if !ok || (len(candidate.pre) > 0 && len(installed.pre) == 0) || candidate.compare(best) <= 0 {
			continue
		}
		if release.asset(assetName) == "" || release.asset(assetName+".sha256") == "" {
			continue
		}
		best, chosen, found = candidate, release, true
	}
	return chosen, best, found
}

func (r ghRelease) asset(name string) string {
	for _, asset := range r.Assets {
		if asset.Name == name {
			return asset.URL
		}
	}
	return ""
}

func get(ctx context.Context, url string, limit int64) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "PokemonSimulatorEvolution/"+version)
	request.Header.Set("Accept", "application/vnd.github+json, application/octet-stream")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s respondeu %d", request.URL.Host, response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("resposta grande demais")
	}
	return data, nil
}

// ---- verificação e instalação ----

var checksumPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

// verifyChecksum confere o conteúdo baixado com o texto do .sha256 ("<hash>  nome" ou só o hash).
func verifyChecksum(data []byte, checksumText string) error {
	fields := strings.Fields(strings.ToLower(checksumText))
	if len(fields) == 0 || !checksumPattern.MatchString(fields[0]) {
		return errors.New("checksum inválido")
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != fields[0] {
		return errors.New("o download não passou na verificação de integridade")
	}
	return nil
}

// replaceExecutable troca o executável por outro. No Windows dá para renomear um .exe em uso:
// o antigo vira .old (apagado na próxima inicialização) e o novo toma o lugar dele.
func replaceExecutable(exe string, data []byte) error {
	fresh := exe + ".new"
	old := exe + ".old"
	if err := os.WriteFile(fresh, data, 0o755); err != nil {
		return err
	}
	_ = os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		_ = os.Remove(fresh)
		return err
	}
	if err := os.Rename(fresh, exe); err != nil {
		_ = os.Rename(old, exe) // desfaz: o jogo continua com a versão atual
		_ = os.Remove(fresh)
		return err
	}
	return nil
}

type updater struct {
	installed semver
	exe       string
	log       func(string, ...any)
}

// available procura uma versão mais nova nas releases do repositório.
func (u *updater) available(ctx context.Context) (ghRelease, semver, bool, error) {
	data, err := get(ctx, updateAPI()+"/repos/"+repository+"/releases?per_page=20", 4<<20)
	if err != nil {
		return ghRelease{}, semver{}, false, err
	}
	var releases []ghRelease
	if err := json.Unmarshal(data, &releases); err != nil {
		return ghRelease{}, semver{}, false, err
	}
	release, latest, ok := pickRelease(releases, u.installed)
	return release, latest, ok, nil
}

// install baixa, confere e instala a release; devolve a nova versão.
func (u *updater) install(ctx context.Context, release ghRelease) error {
	exeURL, sumURL := release.asset(assetName), release.asset(assetName+".sha256")
	prefix := "https://github.com/" + repository + "/releases/download/" + release.Tag + "/"
	if os.Getenv("POKESIM_UPDATE_API") == "" && (!strings.HasPrefix(exeURL, prefix) || !strings.HasPrefix(sumURL, prefix)) {
		return errors.New("endereço de atualização inválido")
	}
	sum, err := get(ctx, sumURL, 4096)
	if err != nil {
		return err
	}
	data, err := get(ctx, exeURL, 200<<20)
	if err != nil {
		return err
	}
	if len(data) < 1<<20 {
		return errors.New("o executável baixado é pequeno demais")
	}
	if err := verifyChecksum(data, string(sum)); err != nil {
		return err
	}
	return replaceExecutable(u.exe, data)
}

// check procura e, se houver, instala. Devolve a versão instalada ("" se já estava atualizado).
func (u *updater) check(ctx context.Context, apply bool) (latest string, installed bool, err error) {
	release, version, ok, err := u.available(ctx)
	if err != nil || !ok {
		return "", false, err
	}
	if !apply {
		return version.String(), false, nil
	}
	u.log("Atualizando para %s…", release.Tag)
	if err := u.install(ctx, release); err != nil {
		return "", false, err
	}
	return version.String(), true, nil
}

// restart inicia o executável (já trocado) e deixa que o chamador encerre o processo atual.
func restart(exe string, args ...string) error {
	command := exec.Command(exe, args...)
	command.Dir = filepath.Dir(exe)
	hideWindow(command)
	return command.Start()
}

func withTimeout(seconds int) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), time.Duration(seconds)*time.Second)
}
