import { Injectable } from '@angular/core';
import * as Neutralino from '@neutralinojs/lib';

export interface CommandResult {
    exitCode: number;
    stdOut: string;
    stdErr: string;
}

/**
 * Non-blocking shell command execution service.
 *
 * Neutralino.os.execCommand is SYNCHRONOUS — it blocks the entire IPC event loop
 * until the command completes (see neutralinojs/neutralinojs#728). This means
 * any UI interaction (dialogs, clicks, rendering) is frozen during execution.
 *
 * This service wraps Neutralino.os.spawnProcess to provide non-blocking alternatives
 * that keep the UI responsive during long-running commands (downloads, extraction, builds).
 *
 * Use execCommand ONLY for commands that complete in <100ms (e.g., echo, reg query).
 * For anything else, use this service.
 */
@Injectable({ providedIn: 'root' })
export class ShellService {
    /**
     * Run a command without blocking the UI. Returns exit code + stdout + stderr.
     *
     * Uses spawnProcess + event buffering to avoid the race condition where
     * fast-exiting processes send events before processId is assigned.
     */
    async run(command: string): Promise<CommandResult> {
        // Buffer all events until we know our processId
        const bufferedEvents: CustomEvent[] = [];
        let processId: number | null = null;
        let stdOut = '';
        let stdErr = '';

        return new Promise((resolve, reject) => {
            let resolved = false;

            const processEvent = (evt: CustomEvent) => {
                switch (evt.detail.action) {
                    case 'stdOut':
                        stdOut += evt.detail.data;
                        break;
                    case 'stdErr':
                        stdErr += evt.detail.data;
                        break;
                    case 'exit':
                        Neutralino.events.off('spawnedProcess', handler);
                        resolved = true;
                        resolve({ exitCode: Number(evt.detail.data), stdOut, stdErr });
                        break;
                }
            };

            const handler = (evt: CustomEvent) => {
                if (processId !== null) {
                    // We know our ID — filter normally
                    if (evt.detail.id !== processId) return;
                    processEvent(evt);
                } else {
                    // Don't know our ID yet — buffer everything
                    bufferedEvents.push(evt);
                }
            };

            Neutralino.events.on('spawnedProcess', handler);

            Neutralino.os
                .spawnProcess(command)
                .then((proc) => {
                    processId = proc.id;
                    // Replay buffered events that match our processId
                    for (const evt of bufferedEvents) {
                        if (evt.detail.id === processId && !resolved) {
                            processEvent(evt);
                        }
                    }
                    bufferedEvents.length = 0;
                })
                .catch((err) => {
                    Neutralino.events.off('spawnedProcess', handler);
                    reject(err);
                });
        });
    }

    /**
     * Run a command, return exit code only. Convenience wrapper.
     */
    async exec(command: string): Promise<number> {
        const result = await this.run(command);
        return result.exitCode;
    }

    /**
     * Run a command, return stdout. Throws if exit code is non-zero.
     */
    async output(command: string): Promise<string> {
        const result = await this.run(command);
        if (result.exitCode !== 0) {
            throw new Error(`Command failed (exit ${result.exitCode}): ${result.stdErr || result.stdOut}`);
        }
        return result.stdOut;
    }

    /**
     * Run a command, return stdout. Returns empty string on failure (no throw).
     */
    async tryOutput(command: string): Promise<string> {
        try {
            const result = await this.run(command);
            return result.stdOut;
        } catch {
            return '';
        }
    }
}
