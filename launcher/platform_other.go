//go:build !windows

package main

import (
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

// Fora do Windows não há bandeja: serve para testar o launcher em outros sistemas (o executável final é só para Windows).

var (
	quitOnce sync.Once
	quitCh   = make(chan struct{})
)

func runTray(a *app) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	select {
	case <-signals:
	case <-quitCh:
	}
}

func trayQuit()                                    { quitOnce.Do(func() { close(quitCh) }) }
func trayNotify(title, message string)             {}
func openTarget(target string) error               { return exec.Command("xdg-open", target).Start() }
func autostartEnabled() bool                       { return false }
func setAutostart(bool, string) error              { return nil }
func showError(title, message string)              { println(title + ": " + message) }
func hideWindow(*exec.Cmd)                         {}
func acquireInstance(time.Duration) (func(), bool) { return func() {}, true }
