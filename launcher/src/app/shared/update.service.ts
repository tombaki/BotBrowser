import { inject, Injectable, signal } from '@angular/core';
import * as Neutralino from '@neutralinojs/lib';
import { ShellService } from './shell.service';
import { AppName } from '../const';

const GITHUB_API_URL = 'https://api.github.com/repos/botswin/BotBrowser/commits?path=launcher&sha=main&per_page=1';
const REPO_ZIP_URL = 'https://github.com/botswin/BotBrowser/archive/refs/heads/main.zip';
const COMMIT_FILE = 'launcher-commit';

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'building' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class UpdateService {
    readonly #shell = inject(ShellService);
    readonly status = signal<UpdateStatus>('idle');
    readonly errorMessage = signal('');
    readonly currentVersion = signal('');

    #commitFilePath = '';
    #installDir = '';
    #nodeDir = '';
    #repoDir = '';
    #isWindows = false;
    #intervalId: ReturnType<typeof setInterval> | null = null;

    /** Start checking for updates: once immediately, then every hour. */
    startPeriodicCheck(): void {
        if (this.#intervalId) return;
        this.checkForUpdate().catch(console.error);
        this.#intervalId = setInterval(() => {
            // Only check if idle (skip if already updating or update ready)
            if (this.status() === 'idle') {
                this.checkForUpdate().catch(console.error);
            }
        }, 60 * 60 * 1000);
    }

    async checkForUpdate(): Promise<void> {
        if (this.status() !== 'idle') return;

        try {
            this.status.set('checking');

            await this.#detectPaths();
            const localCommit = await this.#readLocalCommit();
            if (localCommit) {
                this.currentVersion.set(localCommit.slice(0, 7));
            }
            const remoteCommit = await this.#fetchRemoteCommit();

            if (!remoteCommit) {
                this.status.set('idle');
                return;
            }

            if (!localCommit) {
                // First run — no commit file yet. Save current remote commit and skip update.
                console.log('First run: saving current commit hash.');
                await this.#writeLocalCommit(remoteCommit);
                this.currentVersion.set(remoteCommit.slice(0, 7));
                this.status.set('idle');
                return;
            }

            if (localCommit === remoteCommit) {
                console.log('Launcher is up to date.');
                this.status.set('idle');
                return;
            }

            console.log(`Update available: ${localCommit.slice(0, 7)} → ${remoteCommit.slice(0, 7)}`);
            await this.#performUpdate(remoteCommit);
        } catch (error) {
            console.error('Update check failed:', error);
            this.errorMessage.set(error instanceof Error ? error.message : String(error));
            this.status.set('error');

            // Reset to idle after 10 seconds so it doesn't block the UI
            setTimeout(() => {
                this.status.set('idle');
                this.errorMessage.set('');
            }, 10000);
        }
    }

    async #detectPaths(): Promise<void> {
        const osInfo = await Neutralino.computer.getOSInfo();
        this.#isWindows = osInfo.name.includes('Windows');

        if (this.#isWindows) {
            const result = await this.#shell.run('echo %LOCALAPPDATA%');
            const localAppData = result.stdOut.trim();
            this.#installDir = `${localAppData}\\${AppName}`;
            this.#nodeDir = `${this.#installDir}\\node`;
            this.#repoDir = `${this.#installDir}\\${AppName}`;
        } else {
            const result = await this.#shell.run('echo $HOME');
            const home = result.stdOut.trim();
            this.#installDir = `${home}/.botbrowser`;
            this.#nodeDir = `${this.#installDir}/node`;
            this.#repoDir = `${this.#installDir}/${AppName}`;
        }

        const systemDataPath = await Neutralino.os.getPath('data');
        const sep = this.#isWindows ? '\\' : '/';
        const appDataPath = `${systemDataPath}${sep}${AppName}`;
        try {
            await Neutralino.filesystem.getStats(appDataPath);
        } catch {
            await Neutralino.filesystem.createDirectory(appDataPath);
        }
        this.#commitFilePath = `${appDataPath}${sep}${COMMIT_FILE}`;
    }

    async #readLocalCommit(): Promise<string | null> {
        try {
            const content = await Neutralino.filesystem.readFile(this.#commitFilePath);
            return content.trim() || null;
        } catch {
            return null;
        }
    }

    async #fetchRemoteCommit(): Promise<string | null> {
        try {
            const response = await fetch(GITHUB_API_URL, {
                headers: { Accept: 'application/vnd.github.v3+json' },
            });
            if (!response.ok) return null;
            const data = await response.json();
            // Response is an array of commits (filtered by path=launcher)
            if (Array.isArray(data) && data.length > 0) {
                return data[0].sha ?? null;
            }
            return null;
        } catch {
            return null;
        }
    }

    async #writeLocalCommit(commit: string): Promise<void> {
        await Neutralino.filesystem.writeFile(this.#commitFilePath, commit);
    }

    async #performUpdate(remoteCommit: string): Promise<void> {
        // Step 1: Download ZIP
        this.status.set('downloading');
        const zipPath = this.#isWindows ? `${this.#installDir}\\botbrowser-update.zip` : `${this.#installDir}/botbrowser-update.zip`;

        if (this.#isWindows) {
            await this.#shell.exec(
                `powershell -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '${REPO_ZIP_URL}' -OutFile '${zipPath}' -UseBasicParsing"`
            );
        } else {
            await this.#shell.exec(`curl -fsSL "${REPO_ZIP_URL}" -o "${zipPath}"`);
        }

        // Step 2: Remove old repo, extract new
        if (this.#isWindows) {
            await this.#shell.exec(`rmdir /s /q "${this.#repoDir}"`).catch(() => {});
            await this.#shell.exec(
                `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${this.#installDir}' -Force"`
            );
            await this.#shell.exec(`rename "${this.#installDir}\\BotBrowser-main" "${AppName}"`);
            await this.#shell.exec(`del /f "${zipPath}"`);
        } else {
            await this.#shell.exec(`rm -rf "${this.#repoDir}"`).catch(() => {});
            await this.#shell.exec(`unzip -q -o "${zipPath}" -d "${this.#installDir}"`);
            await this.#shell.exec(`mv "${this.#installDir}/BotBrowser-main" "${this.#repoDir}"`);
            await this.#shell.exec(`rm -f "${zipPath}"`);
        }

        // Step 3: npm ci + npm run build
        this.status.set('building');
        const launcherDir = this.#isWindows ? `${this.#repoDir}\\launcher` : `${this.#repoDir}/launcher`;
        const npmCmd = this.#isWindows ? `"${this.#nodeDir}\\npm.cmd"` : `"${this.#nodeDir}/bin/npm"`;
        const pathEnv = this.#isWindows
            ? `set "PATH=${this.#nodeDir};%PATH%" &&`
            : `export PATH="${this.#nodeDir}/bin:$PATH" &&`;

        await this.#shell.exec(`${pathEnv} cd "${launcherDir}" && ${npmCmd} ci && ${npmCmd} run build`);

        // Step 4: Save commit hash
        await this.#writeLocalCommit(remoteCommit);

        this.status.set('ready');
    }
}
