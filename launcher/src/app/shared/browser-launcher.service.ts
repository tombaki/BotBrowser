/// <reference path="../../neutralino/neutralino.d.ts" />

import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import * as Neutralino from '@neutralinojs/lib';
import { AppName } from '../const';
import { extractMajorVersion } from '../data/bot-profile';
import { BrowserProfileStatus, getBrowserProfileStatusText, type BrowserProfile } from '../data/browser-profile';
import { SimpleCDP } from '../simple-cdp';
import { createDirectoryIfNotExists, sleep } from '../utils';
import { AlertDialogComponent } from './alert-dialog.component';
import { BrowserProfileService } from './browser-profile.service';
import { KernelService } from './kernel.service';

export interface RunningInfo {
    browserProfileId: string;
    status: BrowserProfileStatus;
    spawnProcessInfo?: Neutralino.SpawnedProcess;
    resolver?: any;
    startTime?: number;
}

@Injectable({ providedIn: 'root' })
export class BrowserLauncherService {
    readonly #browserProfileService = inject(BrowserProfileService);
    readonly #kernelService = inject(KernelService);
    readonly #runningStatuses = new Map<string, RunningInfo>();
    readonly #dialog = inject(MatDialog);

    constructor() {
        Neutralino.events.on('spawnedProcess', (evt) => {
            const runningInfo = Array.from(this.#runningStatuses.values()).find(
                (info) => info.spawnProcessInfo?.id === evt.detail.id
            );

            switch (evt.detail.action) {
                case 'stdOut':
                    console.log('stdOut', evt.detail.data);
                    break;
                case 'stdErr':
                    {
                        console.error('stdErr', evt.detail.data);
                        const rgx = /\bws:\/\/.*\/devtools\/browser\/.*\b/;
                        const match = evt.detail.data.match(rgx);
                        const wsURL = match?.[0];
                        if (wsURL) runningInfo?.resolver?.resolve(wsURL);
                    }
                    break;
                case 'exit':
                    {
                        const exitCode = Number(evt.detail.data);
                        console.log(`process terminated with exit code: ${exitCode} id: ${evt.detail.id}`);
                        if (!runningInfo) break; // System process (7z, curl, etc.) — not a browser

                        const uptime = runningInfo.startTime ? Date.now() - runningInfo.startTime : Infinity;
                        runningInfo.status = BrowserProfileStatus.Idle;
                        runningInfo.spawnProcessInfo = undefined;

                        if (exitCode !== 0 && uptime < 5000) {
                            this.#dialog.open(AlertDialogComponent, {
                                data: {
                                    message: `Browser failed to start (exit code ${exitCode}). This can happen right after a kernel update while files are being indexed. Please wait a few seconds and try again.`,
                                },
                            });
                        }
                    }
                    break;
            }
        });
    }

    async getUserDataDirPath(): Promise<string> {
        const systemDataPath = await Neutralino.os.getPath('data');
        const result = await Neutralino.filesystem.getJoinedPath(systemDataPath, AppName, 'user-data-dirs');

        try {
            await Neutralino.filesystem.getStats(result);
        } catch {
            await Neutralino.filesystem.createDirectory(result);
        }

        return result;
    }

    getRunningStatus(browserProfile: string | BrowserProfile): BrowserProfileStatus {
        const id = typeof browserProfile === 'string' ? browserProfile : browserProfile.id;
        return this.#runningStatuses.get(id)?.status ?? BrowserProfileStatus.Idle;
    }

    getRunningStatusText(browserProfile: string | BrowserProfile): string {
        return getBrowserProfileStatusText(this.getRunningStatus(browserProfile));
    }

    async run(browserProfile: BrowserProfile, warmup = false): Promise<void> {
        const osInfo = await Neutralino.computer.getOSInfo();
        const osType = osInfo.name;

        if (this.getRunningStatus(browserProfile) !== BrowserProfileStatus.Idle) {
            throw new Error('The profile is already running');
        }

        let botProfileObject: any | undefined;
        try {
            botProfileObject = JSON.parse(browserProfile.botProfileInfo.content ?? '');
        } catch (error) {
            console.error('Error parsing bot profile content: ', error);
        }

        if (!botProfileObject) {
            this.#dialog.open(AlertDialogComponent, { data: { message: 'Bot profile content is empty, cannot run' } });
            return;
        }

        const sysTempPath = await Neutralino.os.getPath('temp');

        // Save bot profile
        const botProfileContent = JSON.stringify(botProfileObject);
        const botProfilesBasePath = await Neutralino.filesystem.getJoinedPath(sysTempPath, AppName, 'bot-profiles');
        await createDirectoryIfNotExists(botProfilesBasePath);
        const botProfilePath = await Neutralino.filesystem.getJoinedPath(
            botProfilesBasePath,
            `${browserProfile.id}.json`
        );
        await Neutralino.filesystem.writeFile(botProfilePath, botProfileContent);

        // Save browser profile
        browserProfile.lastUsedAt = Date.now();
        await this.#browserProfileService.saveBrowserProfile(browserProfile);

        const browserProfilePath = await this.#browserProfileService.getBrowserProfilePath(browserProfile);
        const userDataDirPath = await Neutralino.filesystem.getJoinedPath(browserProfilePath, 'user-data-dir');
        const diskCacheDirPath = await Neutralino.filesystem.getJoinedPath(
            sysTempPath,
            AppName,
            'disk-cache-dir',
            browserProfile.id
        );

        // Get executable path from kernel based on bot profile version
        let execPath: string | undefined;

        // Extract major version from bot profile
        const userAgent = botProfileObject.userAgent || '';
        const version = botProfileObject.version || '';
        const majorVersion = extractMajorVersion(userAgent) || extractMajorVersion(version);

        if (!majorVersion) {
            this.#dialog.open(AlertDialogComponent, {
                data: { message: 'Could not determine browser version from bot profile. Please check the profile.' },
            });
            return;
        }

        console.log('Bot profile requires kernel major version:', majorVersion);

        // Find matching kernel
        await this.#kernelService.initialize();
        const kernel = await this.#kernelService.getInstalledKernelByMajorVersion(majorVersion);

        if (browserProfile.binaryPath) {
            // Custom executable path set in profile takes highest priority
            if (osType.includes('Darwin')) {
                if (browserProfile.binaryPath.endsWith('.app')) {
                    execPath = await this.#findMacOSExecutable(browserProfile.binaryPath);
                } else {
                    execPath = browserProfile.binaryPath;
                }
            } else {
                execPath = browserProfile.binaryPath;
            }
        } else if (kernel) {
            if (osType.includes('Darwin') && kernel.executablePath.endsWith('.app')) {
                execPath = await this.#findMacOSExecutable(kernel.executablePath);
            } else {
                execPath = kernel.executablePath;
            }
        }

        if (!execPath) {
            // Auto-download the required kernel
            try {
                await this.#kernelService.downloadKernelByMajorVersion(majorVersion);
                this.#dialog.open(AlertDialogComponent, {
                    data: {
                        message: `Kernel version ${majorVersion} is being downloaded. Please wait for the download to complete and try again.`,
                    },
                });
            } catch (error) {
                this.#dialog.open(AlertDialogComponent, {
                    data: {
                        message: `No kernel available for version ${majorVersion}. Error: ${error instanceof Error ? error.message : error}`,
                    },
                });
            }
            return;
        }

        console.log('Neutralino NL_PATH: ', NL_PATH);
        console.log('Chromium path: ', execPath);

        console.log('Starting browser with profile: ', browserProfile.id);
        console.log('Bot profile path: ', botProfilePath);
        console.log('User data dir path: ', userDataDirPath);
        console.log('Disk cache dir path: ', diskCacheDirPath);

        const args = this.#buildCliArgs(browserProfile, { botProfilePath, userDataDirPath, diskCacheDirPath });

        const runningInfo: RunningInfo = { browserProfileId: browserProfile.id, status: BrowserProfileStatus.Running, startTime: Date.now() };

        const warmupUrls = (browserProfile.warmupUrls ?? '').split('\n');
        if (!warmupUrls.length) warmup = false;

        if (warmup) {
            args.push('--remote-debugging-port=0');
            args.push('--remote-allow-origins="*"');

            runningInfo.resolver = {};
            runningInfo.resolver.promise = new Promise<string>((resolve) => {
                runningInfo.resolver.resolve = resolve;
            });
        }

        const proc = await Neutralino.os.spawnProcess(`"${execPath}" ${args.join(' ')}`);
        runningInfo.spawnProcessInfo = proc;

        this.#runningStatuses.set(browserProfile.id, runningInfo);

        if (warmup) {
            console.log('Waiting for WS URL, browserProfile.id: ', browserProfile.id);
            const wsURL = await runningInfo.resolver.promise;
            console.log('We got WS URL: ', wsURL);

            const simpleCDP = new SimpleCDP(wsURL);
            try {
                await simpleCDP.connect();
                const targets = await simpleCDP.getTargets();
                console.log('Targets: ', targets);
                const pageTarget = targets.find((t) => t.type === 'page');
                const sessionId = await simpleCDP.attachToTarget(pageTarget.targetId);
                console.log('Session ID: ', sessionId);

                for (const warmupUrl of warmupUrls) {
                    console.log('Navigating to: ', warmupUrl);
                    await simpleCDP.navigate(sessionId, warmupUrl);
                    await sleep(Math.floor(Math.random() * 8000) + 5000);
                }
            } finally {
                simpleCDP.close();
            }
        }
    }

    #buildCliArgs(
        profile: BrowserProfile,
        paths: { botProfilePath: string; userDataDirPath: string; diskCacheDirPath: string }
    ): string[] {
        const args = [
            '--allow-pre-commit-input',
            '--enable-automation',
            '--metrics-recording-only',
            '--no-first-run',
            '--password-store=basic',
            '--use-mock-keychain',
            '--restore-last-session',
            '--disable-blink-features=AutomationControlled',
            `--user-data-dir="${paths.userDataDirPath}"`,
            `--disk-cache-dir="${paths.diskCacheDirPath}"`,
            `--bot-profile="${paths.botProfilePath}"`,
        ];

        const opts = profile.launchOptions;

        // Behavior
        if (opts?.behavior?.botLocalDns) args.push('--bot-local-dns');
        if (opts?.behavior?.botDisableDebugger) args.push('--bot-disable-debugger');
        if (opts?.behavior?.botMobileForceTouch) args.push('--bot-mobile-force-touch');
        if (opts?.behavior?.botAlwaysActive) args.push('--bot-always-active');
        if (opts?.behavior?.botInjectRandomHistory) args.push('--bot-inject-random-history');
        if (opts?.behavior?.botDisableConsoleMessage) args.push('--bot-disable-console-message');
        if (opts?.behavior?.botPortProtection) args.push('--bot-port-protection');
        if (opts?.behavior?.botNetworkInfoOverride) args.push('--bot-network-info-override');

        // Identity & Locale
        if (opts?.identityLocale?.botConfigBrowserBrand)
            args.push(`--bot-config-browser-brand=${opts.identityLocale.botConfigBrowserBrand}`);
        if (opts?.identityLocale?.botConfigBrandFullVersion)
            args.push(`--bot-config-brand-full-version=${opts.identityLocale.botConfigBrandFullVersion}`);
        if (opts?.identityLocale?.botConfigUaFullVersion)
            args.push(`--bot-config-ua-full-version=${opts.identityLocale.botConfigUaFullVersion}`);
        if (opts?.identityLocale?.botConfigLanguages)
            args.push(`--bot-config-languages=${opts.identityLocale.botConfigLanguages}`);
        if (opts?.identityLocale?.botConfigLocale)
            args.push(`--bot-config-locale=${opts.identityLocale.botConfigLocale}`);
        if (opts?.identityLocale?.botConfigTimezone)
            args.push(`--bot-config-timezone=${opts.identityLocale.botConfigTimezone}`);
        if (opts?.identityLocale?.botConfigLocation)
            args.push(`--bot-config-location=${opts.identityLocale.botConfigLocation}`);

        // Custom User-Agent
        if (opts?.customUserAgent?.userAgent)
            args.push(`--user-agent="${opts.customUserAgent.userAgent}"`);
        if (opts?.customUserAgent?.botConfigPlatform)
            args.push(`--bot-config-platform=${opts.customUserAgent.botConfigPlatform}`);
        if (opts?.customUserAgent?.botConfigPlatformVersion)
            args.push(`--bot-config-platform-version=${opts.customUserAgent.botConfigPlatformVersion}`);
        if (opts?.customUserAgent?.botConfigModel)
            args.push(`--bot-config-model=${opts.customUserAgent.botConfigModel}`);
        if (opts?.customUserAgent?.botConfigArchitecture)
            args.push(`--bot-config-architecture=${opts.customUserAgent.botConfigArchitecture}`);
        if (opts?.customUserAgent?.botConfigBitness)
            args.push(`--bot-config-bitness=${opts.customUserAgent.botConfigBitness}`);
        if (opts?.customUserAgent?.botConfigMobile) args.push('--bot-config-mobile');

        // Display & Input
        if (opts?.displayInput?.botConfigWindow)
            args.push(`--bot-config-window=${opts.displayInput.botConfigWindow}`);
        if (opts?.displayInput?.botConfigScreen)
            args.push(`--bot-config-screen=${opts.displayInput.botConfigScreen}`);
        if (opts?.displayInput?.botConfigKeyboard)
            args.push(`--bot-config-keyboard=${opts.displayInput.botConfigKeyboard}`);
        if (opts?.displayInput?.botConfigFonts)
            args.push(`--bot-config-fonts=${opts.displayInput.botConfigFonts}`);
        if (opts?.displayInput?.botConfigColorScheme)
            args.push(`--bot-config-color-scheme=${opts.displayInput.botConfigColorScheme}`);
        if (opts?.displayInput?.botConfigDisableDeviceScaleFactor)
            args.push('--bot-config-disable-device-scale-factor');

        // Noise
        if (opts?.noise?.botConfigNoiseWebglImage) args.push('--bot-config-noise-webgl-image');
        if (opts?.noise?.botConfigNoiseCanvas) args.push('--bot-config-noise-canvas');
        if (opts?.noise?.botConfigNoiseAudioContext) args.push('--bot-config-noise-audio-context');
        if (opts?.noise?.botConfigNoiseClientRects) args.push('--bot-config-noise-client-rects');
        if (opts?.noise?.botConfigNoiseTextRects) args.push('--bot-config-noise-text-rects');
        if (opts?.noise?.botNoiseSeed != null) args.push(`--bot-noise-seed=${opts.noise.botNoiseSeed}`);
        if (opts?.noise?.botTimeScale != null) args.push(`--bot-time-scale=${opts.noise.botTimeScale}`);
        if (opts?.noise?.botFps) args.push(`--bot-fps=${opts.noise.botFps}`);
        if (opts?.noise?.botTimeSeed != null && opts.noise.botTimeSeed !== 0)
            args.push(`--bot-time-seed=${opts.noise.botTimeSeed}`);
        if (opts?.noise?.botStackSeed) args.push(`--bot-stack-seed=${opts.noise.botStackSeed}`);

        // Rendering & Media
        if (opts?.renderingMedia?.botConfigWebgl)
            args.push(`--bot-config-webgl=${opts.renderingMedia.botConfigWebgl}`);
        if (opts?.renderingMedia?.botConfigWebgpu)
            args.push(`--bot-config-webgpu=${opts.renderingMedia.botConfigWebgpu}`);
        if (opts?.renderingMedia?.botConfigSpeechVoices)
            args.push(`--bot-config-speech-voices=${opts.renderingMedia.botConfigSpeechVoices}`);
        if (opts?.renderingMedia?.botConfigMediaDevices)
            args.push(`--bot-config-media-devices=${opts.renderingMedia.botConfigMediaDevices}`);
        if (opts?.renderingMedia?.botConfigMediaTypes)
            args.push(`--bot-config-media-types=${opts.renderingMedia.botConfigMediaTypes}`);
        if (opts?.renderingMedia?.botConfigWebrtc)
            args.push(`--bot-config-webrtc=${opts.renderingMedia.botConfigWebrtc}`);
        if (opts?.renderingMedia?.botWebrtcIce)
            args.push(`--bot-webrtc-ice=${opts.renderingMedia.botWebrtcIce}`);

        // Proxy
        if (profile.proxyServer) args.push(`--proxy-server=${profile.proxyServer}`);
        if (opts?.proxy?.proxyIp) args.push(`--proxy-ip=${opts.proxy.proxyIp}`);
        if (opts?.proxy?.botIpService) args.push(`--bot-ip-service=${opts.proxy.botIpService}`);
        if (opts?.proxy?.proxyBypassRgx) args.push(`--proxy-bypass-rgx=${opts.proxy.proxyBypassRgx}`);

        // Advanced
        if (opts?.advanced?.botCookies) args.push(`--bot-cookies=${opts.advanced.botCookies}`);
        if (opts?.advanced?.botBookmarks) args.push(`--bot-bookmarks=${opts.advanced.botBookmarks}`);
        if (opts?.advanced?.botCustomHeaders)
            args.push(`--bot-custom-headers=${opts.advanced.botCustomHeaders}`);

        if (profile.basicInfo.profileName) args.push(`--bot-title="${profile.basicInfo.profileName}"`);

        return args;
    }

    async stop(browserProfile: BrowserProfile): Promise<void> {
        if (this.getRunningStatus(browserProfile) !== BrowserProfileStatus.Running) {
            throw new Error('The profile is not running');
        }

        const runningInfo = this.#runningStatuses.get(browserProfile.id);
        if (!runningInfo || !runningInfo.spawnProcessInfo) {
            throw new Error('No running info found');
        }

        runningInfo.status = BrowserProfileStatus.Stopping;
        await Neutralino.os.updateSpawnedProcess(runningInfo.spawnProcessInfo.id, 'exit');
    }

    async #findMacOSExecutable(appPath: string): Promise<string> {
        // Try common executable names inside .app bundle
        const possibleNames = ['Chromium', 'chrome', 'Google Chrome', 'BotBrowser'];

        for (const name of possibleNames) {
            const execPath = await Neutralino.filesystem.getJoinedPath(appPath, 'Contents', 'MacOS', name);
            try {
                await Neutralino.filesystem.getStats(execPath);
                return execPath;
            } catch {
                continue;
            }
        }

        // If no known name found, try to find the first executable in Contents/MacOS
        try {
            const result = await Neutralino.os.execCommand(`ls "${appPath}/Contents/MacOS" 2>/dev/null | head -1`);
            const mainExec = result.stdOut.trim();
            if (mainExec) {
                return await Neutralino.filesystem.getJoinedPath(appPath, 'Contents', 'MacOS', mainExec);
            }
        } catch {
            // Ignore
        }

        // Fallback to default Chromium path
        return await Neutralino.filesystem.getJoinedPath(appPath, 'Contents', 'MacOS', 'Chromium');
    }
}
