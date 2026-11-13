//go:build windows

package main

import "runtime"

// A janela e o laço de mensagens precisam ficar na mesma thread do sistema.
func lockThread() { runtime.LockOSThread() }
