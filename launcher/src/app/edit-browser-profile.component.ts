import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, ElementRef, inject, NgZone, ViewChild, type AfterViewInit, type OnDestroy, type OnInit } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import * as Neutralino from '@neutralinojs/lib';
import { compact } from 'lodash-es';
import { BehaviorSubject, combineLatest, map, startWith } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { tryParseBotProfile, type BotProfileBasicInfo } from './data/bot-profile';
import {
    Architectures,
    Bitnesses,
    BrowserBrands,
    BrowserProfileStatus,
    ColorSchemes,
    FontOptions,
    MediaTypesOptions,
    Platforms,
    ProfileRealDisabledOptions,
    ProfileRealOptions,
    type BasicInfo,
    type BehaviorToggles,
    type BotProfileInfo,
    type BrowserProfile,
    type CustomUserAgentConfig,
    type DisplayInputConfig,
    type IdentityLocaleConfig,
    type LaunchOptions,
    type AdvancedConfig,
    type NoiseConfig,
    type ProxyConfig,
    type RenderingMediaConfig,
} from './data/browser-profile';
import type { Proxy } from './data/proxy';
import { AlertDialogComponent } from './shared/alert-dialog.component';
import { BrowserLauncherService } from './shared/browser-launcher.service';
import { BrowserProfileService } from './shared/browser-profile.service';
import { ConfirmDialogComponent } from './shared/confirm-dialog.component';
import { ProxyInputComponent } from './shared/proxy-input.component';
import { ProxyParserService, type ParsedProxy } from './shared/proxy-parser.service';
import { ProxyService } from './shared/proxy.service';

@Component({
    selector: 'app-edit-browser-profile',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        FormsModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatCheckboxModule,
        MatButtonModule,
        MatButtonToggleModule,
        MatAutocompleteModule,
        MatSelectModule,
        MatSlideToggleModule,
        AsyncPipe,
        ProxyInputComponent,
    ],
    templateUrl: './edit-browser-profile.component.html',
    styleUrl: './edit-browser-profile.component.scss',
})
export class EditBrowserProfileComponent implements OnInit, AfterViewInit, OnDestroy {
    readonly #browserProfileService = inject(BrowserProfileService);
    readonly #browserLauncherService = inject(BrowserLauncherService);
    readonly #proxyService = inject(ProxyService);
    readonly #proxyParser = inject(ProxyParserService);

    #injectedData = inject<BrowserProfile | undefined>(MAT_DIALOG_DATA);

    readonly #formBuilder = inject(FormBuilder);
    readonly #dialog = inject(MatDialog);
    readonly #dialogRef = inject(MatDialogRef<EditBrowserProfileComponent>);
    readonly #ngZone = inject(NgZone);

    // Section navigation
    @ViewChild('sectionContent') sectionContent!: ElementRef<HTMLElement>;

    readonly navItems = [
        { id: 'section-basic', label: 'Basic Info' },
        { id: 'section-proxy', label: 'Proxy' },
        { id: 'section-identity', label: 'Identity' },
        { id: 'section-display', label: 'Display' },
        { id: 'section-noise', label: 'Noise' },
        { id: 'section-rendering', label: 'Rendering' },
        { id: 'section-behavior', label: 'Behavior' },
        { id: 'section-advanced', label: 'Advanced' },
    ];
    activeSection = 'section-basic';
    #observer: IntersectionObserver | null = null;

    // Expose constants for template
    readonly browserBrands = BrowserBrands;
    readonly platforms = Platforms;
    readonly architectures = Architectures;
    readonly bitnesses = Bitnesses;
    readonly profileRealDisabledOptions = ProfileRealDisabledOptions;
    readonly profileRealOptions = ProfileRealOptions;
    readonly fontOptions = FontOptions;
    readonly mediaTypesOptions = MediaTypesOptions;
    readonly colorSchemes = ColorSchemes;

    readonly basicInfoFormGroup = this.#formBuilder.group<BasicInfo>({
        profileName: this.#injectedData?.basicInfo.profileName || 'New Profile',
        groupName: this.#injectedData?.basicInfo.groupName || '',
        description: this.#injectedData?.basicInfo.description || '',
    });

    #groupNames$ = new BehaviorSubject<string[]>([]);
    readonly filteredGroupNames = combineLatest([
        this.basicInfoFormGroup.get('groupName')!.valueChanges.pipe(startWith('')),
        this.#groupNames$,
    ]).pipe(
        map(([filterValue, groupNames]) => {
            const filter = (filterValue || '').toLowerCase();
            if (!filter) {
                return groupNames;
            }
            return groupNames.filter((option) => option.toLowerCase().includes(filter));
        })
    );

    readonly botProfileInfoGroup = this.#formBuilder.group<BotProfileInfo>({
        filename: this.#injectedData?.botProfileInfo.filename || '',
        content: this.#injectedData?.botProfileInfo.content,
    });

    readonly advancedGroup = this.#formBuilder.group({
        binaryPath: this.#injectedData?.binaryPath || '',
    });

    proxyValue: ParsedProxy | null = this.#injectedData?.proxyServer
        ? this.#proxyParser.parse(this.#injectedData.proxyServer)
        : null;
    selectedProxyId = '';

    // Behavior toggles - defaults:
    // DisableDebugger=true, DisableConsoleMessage=true, AlwaysActive=true
    readonly behaviorGroup = this.#formBuilder.group<BehaviorToggles>({
        botLocalDns: this.#injectedData?.launchOptions?.behavior?.botLocalDns,
        botDisableDebugger: this.#injectedData?.launchOptions?.behavior?.botDisableDebugger ?? true,
        botMobileForceTouch: this.#injectedData?.launchOptions?.behavior?.botMobileForceTouch,
        botAlwaysActive: this.#injectedData?.launchOptions?.behavior?.botAlwaysActive ?? true,
        botInjectRandomHistory: this.#injectedData?.launchOptions?.behavior?.botInjectRandomHistory,
        botDisableConsoleMessage: this.#injectedData?.launchOptions?.behavior?.botDisableConsoleMessage ?? true,
        botPortProtection: this.#injectedData?.launchOptions?.behavior?.botPortProtection,
        botNetworkInfoOverride: this.#injectedData?.launchOptions?.behavior?.botNetworkInfoOverride,
    });

    // Identity & Locale - default: browserBrand=chrome
    readonly identityLocaleGroup = this.#formBuilder.group<IdentityLocaleConfig>({
        botConfigBrowserBrand: this.#injectedData?.launchOptions?.identityLocale?.botConfigBrowserBrand ?? 'chrome',
        botConfigBrandFullVersion: this.#injectedData?.launchOptions?.identityLocale?.botConfigBrandFullVersion,
        botConfigUaFullVersion: this.#injectedData?.launchOptions?.identityLocale?.botConfigUaFullVersion,
        botConfigLanguages: this.#injectedData?.launchOptions?.identityLocale?.botConfigLanguages,
        botConfigLocale: this.#injectedData?.launchOptions?.identityLocale?.botConfigLocale,
        botConfigTimezone: this.#injectedData?.launchOptions?.identityLocale?.botConfigTimezone,
        botConfigLocation: this.#injectedData?.launchOptions?.identityLocale?.botConfigLocation,
    });

    // Custom User-Agent
    readonly customUserAgentGroup = this.#formBuilder.group<CustomUserAgentConfig>({
        userAgent: this.#injectedData?.launchOptions?.customUserAgent?.userAgent,
        botConfigPlatform: this.#injectedData?.launchOptions?.customUserAgent?.botConfigPlatform,
        botConfigPlatformVersion: this.#injectedData?.launchOptions?.customUserAgent?.botConfigPlatformVersion,
        botConfigModel: this.#injectedData?.launchOptions?.customUserAgent?.botConfigModel,
        botConfigArchitecture: this.#injectedData?.launchOptions?.customUserAgent?.botConfigArchitecture,
        botConfigBitness: this.#injectedData?.launchOptions?.customUserAgent?.botConfigBitness,
        botConfigMobile: this.#injectedData?.launchOptions?.customUserAgent?.botConfigMobile,
    });

    // Display & Input - defaults: window/screen=real, keyboard/fonts=profile, colorScheme=light
    readonly displayInputGroup = this.#formBuilder.group<DisplayInputConfig>({
        botConfigWindow: this.#injectedData?.launchOptions?.displayInput?.botConfigWindow ?? 'real',
        botConfigScreen: this.#injectedData?.launchOptions?.displayInput?.botConfigScreen ?? 'real',
        botConfigKeyboard: this.#injectedData?.launchOptions?.displayInput?.botConfigKeyboard ?? 'profile',
        botConfigFonts: this.#injectedData?.launchOptions?.displayInput?.botConfigFonts ?? 'profile',
        botConfigColorScheme: this.#injectedData?.launchOptions?.displayInput?.botConfigColorScheme ?? 'light',
        botConfigDisableDeviceScaleFactor:
            this.#injectedData?.launchOptions?.displayInput?.botConfigDisableDeviceScaleFactor,
    });

    // Noise - defaults:
    // NoiseCanvas=true, NoiseWebglImage=true, NoiseAudioContext=true
    // NoiseClientRects=false, NoiseTextRects=true
    readonly noiseGroup = this.#formBuilder.group<NoiseConfig>({
        botConfigNoiseWebglImage: this.#injectedData?.launchOptions?.noise?.botConfigNoiseWebglImage ?? true,
        botConfigNoiseCanvas: this.#injectedData?.launchOptions?.noise?.botConfigNoiseCanvas ?? true,
        botConfigNoiseAudioContext: this.#injectedData?.launchOptions?.noise?.botConfigNoiseAudioContext ?? true,
        botConfigNoiseClientRects: this.#injectedData?.launchOptions?.noise?.botConfigNoiseClientRects,
        botConfigNoiseTextRects: this.#injectedData?.launchOptions?.noise?.botConfigNoiseTextRects ?? true,
        botNoiseSeed: this.#injectedData?.launchOptions?.noise?.botNoiseSeed,
        botTimeScale: this.#injectedData?.launchOptions?.noise?.botTimeScale,
        botFps: this.#injectedData?.launchOptions?.noise?.botFps,
        botTimeSeed: this.#injectedData?.launchOptions?.noise?.botTimeSeed,
        botStackSeed: this.#injectedData?.launchOptions?.noise?.botStackSeed,
    });

    // FPS mode derived from botFps value
    fpsMode: '' | 'profile' | 'real' | 'number' = (() => {
        const fps = this.#injectedData?.launchOptions?.noise?.botFps;
        if (fps === 'profile' || fps === 'real') return fps;
        if (fps) return 'number' as const;
        return '' as const;
    })();

    // Stack Seed mode derived from botStackSeed value
    stackSeedMode: '' | 'profile' | 'real' | 'number' = (() => {
        const seed = this.#injectedData?.launchOptions?.noise?.botStackSeed;
        if (seed === 'profile' || seed === 'real') return seed;
        if (seed) return 'number' as const;
        return '' as const;
    })();

    // Rendering & Media - defaults: webgl/webgpu/speechVoices/mediaDevices/webrtc=profile, mediaTypes=expand
    readonly renderingMediaGroup = this.#formBuilder.group<RenderingMediaConfig>({
        botConfigWebgl: this.#injectedData?.launchOptions?.renderingMedia?.botConfigWebgl ?? 'profile',
        botConfigWebgpu: this.#injectedData?.launchOptions?.renderingMedia?.botConfigWebgpu ?? 'profile',
        botConfigSpeechVoices: this.#injectedData?.launchOptions?.renderingMedia?.botConfigSpeechVoices ?? 'profile',
        botConfigMediaDevices: this.#injectedData?.launchOptions?.renderingMedia?.botConfigMediaDevices ?? 'profile',
        botConfigMediaTypes: this.#injectedData?.launchOptions?.renderingMedia?.botConfigMediaTypes ?? 'expand',
        botConfigWebrtc: this.#injectedData?.launchOptions?.renderingMedia?.botConfigWebrtc ?? 'profile',
        botWebrtcIce: this.#injectedData?.launchOptions?.renderingMedia?.botWebrtcIce,
    });

    // Proxy config (advanced)
    readonly proxyConfigGroup = this.#formBuilder.group<ProxyConfig>({
        proxyServer: this.#injectedData?.launchOptions?.proxy?.proxyServer,
        proxyIp: this.#injectedData?.launchOptions?.proxy?.proxyIp,
        botIpService: this.#injectedData?.launchOptions?.proxy?.botIpService,
        proxyBypassRgx: this.#injectedData?.launchOptions?.proxy?.proxyBypassRgx,
    });

    // Advanced config
    readonly advancedConfigGroup = this.#formBuilder.group<AdvancedConfig>({
        botCookies: this.#injectedData?.launchOptions?.advanced?.botCookies,
        botBookmarks: this.#injectedData?.launchOptions?.advanced?.botBookmarks,
        botCustomHeaders: this.#injectedData?.launchOptions?.advanced?.botCustomHeaders,
    });

    // Advanced section modes
    executableMode: 'kernel' | 'custom' = this.#injectedData?.binaryPath ? 'custom' : 'kernel';

    cookiesMode: 'file' | 'input' = (() => {
        const v = this.#injectedData?.launchOptions?.advanced?.botCookies;
        if (!v) return 'file' as const;
        return v.startsWith('@') ? 'file' as const : 'input' as const;
    })();

    bookmarksMode: 'file' | 'input' = (() => {
        const v = this.#injectedData?.launchOptions?.advanced?.botBookmarks;
        if (!v) return 'file' as const;
        return v.startsWith('@') ? 'file' as const : 'input' as const;
    })();

    cookiesFilePath = (() => {
        const v = this.#injectedData?.launchOptions?.advanced?.botCookies;
        return v?.startsWith('@') ? v.substring(1) : '';
    })();

    bookmarksFilePath = (() => {
        const v = this.#injectedData?.launchOptions?.advanced?.botBookmarks;
        return v?.startsWith('@') ? v.substring(1) : '';
    })();

    isEdit = false;
    basicInfo: BotProfileBasicInfo | null = null;
    proxies: Proxy[] = [];

    constructor() {
        if (this.#injectedData) {
            this.isEdit = true;

            const status = this.#browserLauncherService.getRunningStatus(this.#injectedData);
            if (status !== BrowserProfileStatus.Idle) {
                throw new Error('Cannot edit a running profile');
            }

            if (this.#injectedData.botProfileInfo.content) {
                this.basicInfo = tryParseBotProfile(this.#injectedData.botProfileInfo.content);
            }
        }

        this.#browserProfileService.getAllBrowserProfiles().then((profiles) => {
            this.#groupNames$.next(compact(profiles.map((profile) => profile.basicInfo.groupName)));
        });
    }

    async ngOnInit() {
        // Load proxies
        this.proxies = await this.#proxyService.getAllProxies();
    }

    ngAfterViewInit() {
        this.#setupScrollspy();
    }

    ngOnDestroy() {
        this.#observer?.disconnect();
    }

    scrollToSection(sectionId: string): void {
        const el = document.getElementById(sectionId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            this.activeSection = sectionId;
        }
    }

    #setupScrollspy(): void {
        const container = this.sectionContent?.nativeElement;
        if (!container) return;

        this.#observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        this.#ngZone.run(() => {
                            this.activeSection = entry.target.id;
                        });
                        break;
                    }
                }
            },
            {
                root: container,
                rootMargin: '-10% 0px -80% 0px',
                threshold: 0,
            }
        );

        for (const nav of this.navItems) {
            const el = document.getElementById(nav.id);
            if (el) this.#observer.observe(el);
        }
    }

    onFpsModeChange(): void {
        if (this.fpsMode === 'profile' || this.fpsMode === 'real') {
            this.noiseGroup.patchValue({ botFps: this.fpsMode });
        } else if (this.fpsMode === 'number') {
            this.noiseGroup.patchValue({ botFps: '' });
        } else {
            this.noiseGroup.patchValue({ botFps: '' });
        }
    }

    onStackSeedModeChange(): void {
        if (this.stackSeedMode === 'profile' || this.stackSeedMode === 'real') {
            this.noiseGroup.patchValue({ botStackSeed: this.stackSeedMode });
        } else if (this.stackSeedMode === 'number') {
            this.noiseGroup.patchValue({ botStackSeed: '' });
        } else {
            this.noiseGroup.patchValue({ botStackSeed: '' });
        }
    }

    onProxySelected(proxyId: string): void {
        if (!proxyId) {
            return;
        }
        const proxy = this.proxies.find((p) => p.id === proxyId);
        if (proxy) {
            this.proxyValue = {
                type: proxy.type,
                host: proxy.host,
                port: proxy.port,
                username: proxy.username,
                password: proxy.password,
            };
        }
    }

    onProxyValueChange(value: ParsedProxy | null): void {
        this.proxyValue = value;
        this.selectedProxyId = '';
    }

    onClearProxy(): void {
        this.proxyValue = null;
        this.selectedProxyId = '';
        this.proxyConfigGroup.patchValue({ proxyIp: '', botIpService: '' });
    }

    async onSaveProxyToList(proxy: ParsedProxy): Promise<void> {
        const duplicate = this.proxies.find(
            (p) => p.host === proxy.host && p.port === proxy.port && (p.username || '') === (proxy.username || '') && (p.password || '') === (proxy.password || '')
        );
        if (duplicate) {
            this.#dialog.open(AlertDialogComponent, {
                data: { message: `Proxy ${proxy.host}:${proxy.port} already exists in the proxy list.` },
            });
            return;
        }

        await this.#proxyService.addProxy({
            id: uuidv4(),
            name: `${proxy.host}:${proxy.port}`,
            type: proxy.type,
            host: proxy.host,
            port: proxy.port,
            username: proxy.username,
            password: proxy.password,
        });
        this.proxies = await this.#proxyService.getAllProxies();
        this.#dialog.open(AlertDialogComponent, {
            data: { message: `Proxy ${proxy.host}:${proxy.port} saved to proxy list.` },
        });
    }

    async chooseFile(): Promise<void> {
        let entries: string[];
        try {
            entries = await Neutralino.os.showOpenDialog('Select a profile', {
                filters: [{ name: 'Profiles', extensions: ['json', 'enc'] }],
                multiSelections: false,
            });
        } catch (error) {
            console.error('Failed to open file dialog:', error);
            this.#dialog.open(AlertDialogComponent, {
                data: { message: `Failed to open file dialog: ${error instanceof Error ? error.message : error}` },
            });
            return;
        }
        const entry = entries[0];
        if (!entry) return;

        if (!this.isEdit || !this.#injectedData?.botProfileInfo.content) {
            this.#handleFileSelection(entry);
            return;
        }

        // Re-selecting an existing botprofile may result in an unknown detection error
        this.#dialog
            .open(ConfirmDialogComponent, {
                data: {
                    defaultCancel: true,
                    message:
                        'Re-selecting an existing bot profile may result in an unknown detection error. Are you sure you want to proceed?',
                },
            })
            .afterClosed()
            .subscribe((result: boolean) => {
                if (!result) return;
                this.#handleFileSelection(entry);
            });
    }

    onExecutableModeChange(mode: 'kernel' | 'custom'): void {
        this.executableMode = mode;
        if (mode === 'kernel') {
            this.advancedGroup.patchValue({ binaryPath: '' });
        }
    }

    onCookiesModeChange(mode: 'file' | 'input'): void {
        this.cookiesMode = mode;
        this.cookiesFilePath = '';
        this.advancedConfigGroup.patchValue({ botCookies: '' });
    }

    onBookmarksModeChange(mode: 'file' | 'input'): void {
        this.bookmarksMode = mode;
        this.bookmarksFilePath = '';
        this.advancedConfigGroup.patchValue({ botBookmarks: '' });
    }

    async chooseExecutable(): Promise<void> {
        let entries: string[];
        try {
            entries = await Neutralino.os.showOpenDialog('Select BotBrowser executable', {
                filters: [
                    { name: 'Executable', extensions: ['exe', 'app', ''] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                multiSelections: false,
            });
        } catch (error) {
            console.error('Failed to open file dialog:', error);
            return;
        }
        const entry = entries[0];
        if (!entry) return;

        this.advancedGroup.get('binaryPath')?.setValue(entry);
    }

    async chooseCookiesFile(): Promise<void> {
        let entries: string[];
        try {
            entries = await Neutralino.os.showOpenDialog('Select cookies JSON file', {
                filters: [{ name: 'JSON', extensions: ['json'] }],
                multiSelections: false,
            });
        } catch {
            return;
        }
        const entry = entries[0];
        if (!entry) return;

        this.#ngZone.run(() => {
            this.cookiesFilePath = entry;
            this.advancedConfigGroup.patchValue({ botCookies: `@${entry}` });
        });
    }

    async chooseBookmarksFile(): Promise<void> {
        let entries: string[];
        try {
            entries = await Neutralino.os.showOpenDialog('Select bookmarks JSON file', {
                filters: [{ name: 'JSON', extensions: ['json'] }],
                multiSelections: false,
            });
        } catch {
            return;
        }
        const entry = entries[0];
        if (!entry) return;

        this.#ngZone.run(() => {
            this.bookmarksFilePath = entry;
            this.advancedConfigGroup.patchValue({ botBookmarks: `@${entry}` });
        });
    }

    #handleFileSelection(filePath: string): void {
        Neutralino.filesystem
            .readFile(filePath)
            .then((content) => {
                const basicInfo = tryParseBotProfile(content);
                if (!basicInfo) {
                    this.#dialog.open(AlertDialogComponent, {
                        data: { message: 'Invalid bot profile file.' },
                    });
                    return;
                }

                this.basicInfo = basicInfo;
                this.botProfileInfoGroup.get('content')?.setValue(content);
                this.botProfileInfoGroup.get('filename')?.setValue(filePath);

                // Auto-configure settings for Android profiles
                if (this.#isAndroidProfile(basicInfo)) {
                    this.displayInputGroup.patchValue({
                        botConfigWindow: 'profile',
                        botConfigScreen: 'profile',
                    });
                    this.behaviorGroup.patchValue({
                        botMobileForceTouch: true,
                    });
                }
            })
            .catch((error) => {
                console.error('Failed to read file:', error);
                this.#dialog.open(AlertDialogComponent, {
                    data: { message: `Failed to read file: ${error.message || error}` },
                });
            });
    }

    #isAndroidProfile(basicInfo: BotProfileBasicInfo): boolean {
        return basicInfo.userAgent.toLowerCase().includes('android');
    }

    #validate(): boolean {
        if (!this.basicInfo) {
            this.#dialog.open(AlertDialogComponent, {
                data: { message: 'Bot profile must be selected and valid.' },
            });
            return false;
        }

        return true;
    }

    async onConfirmClick(): Promise<void> {
        console.log('onConfirmClick called');

        if (!this.#validate()) {
            console.log('validate failed');
            return;
        }
        console.log('validate passed');

        if (!this.basicInfoFormGroup.valid) {
            console.log('basicInfoFormGroup invalid');
            this.#dialog.open(AlertDialogComponent, {
                data: { message: 'Please fill in all required fields.' },
            });
            return;
        }
        console.log('basicInfoFormGroup valid');

        if (!this.botProfileInfoGroup.value?.content) {
            console.log('botProfileInfoGroup content missing');
            this.#dialog.open(AlertDialogComponent, {
                data: { message: 'Bot profile content is missing. Please select a valid profile file.' },
            });
            return;
        }
        console.log('botProfileInfoGroup content exists');

        const launchOptions: LaunchOptions = {
            behavior: this.#cleanObject(this.behaviorGroup.value) as BehaviorToggles | undefined,
            identityLocale: this.#cleanObject(this.identityLocaleGroup.value) as IdentityLocaleConfig | undefined,
            customUserAgent: this.#cleanObject(this.customUserAgentGroup.value) as CustomUserAgentConfig | undefined,
            displayInput: this.#cleanObject(this.displayInputGroup.value) as DisplayInputConfig | undefined,
            noise: this.#cleanObject(this.noiseGroup.value) as NoiseConfig | undefined,
            renderingMedia: this.#cleanObject(this.renderingMediaGroup.value) as RenderingMediaConfig | undefined,
            proxy: this.#cleanObject(this.proxyConfigGroup.value) as ProxyConfig | undefined,
            advanced: this.#cleanObject(this.advancedConfigGroup.value) as AdvancedConfig | undefined,
        };

        const browserProfile: BrowserProfile = {
            id: this.#injectedData?.id || uuidv4(),
            basicInfo: this.basicInfoFormGroup.value,
            botProfileInfo: this.botProfileInfoGroup.value,
            binaryPath: this.advancedGroup.value.binaryPath || undefined,
            proxyServer: this.proxyValue ? this.#proxyParser.toUrl(this.proxyValue) : undefined,
            createdAt: this.#injectedData?.createdAt || Date.now(),
            lastUsedAt: this.#injectedData?.lastUsedAt,
            updatedAt: Date.now(),
            warmupUrls: this.#injectedData?.warmupUrls,
            launchOptions: this.#cleanObject(launchOptions),
        };

        try {
            console.log('Saving browser profile...');
            await this.#browserProfileService.saveBrowserProfile(browserProfile);
            console.log('Browser profile saved successfully');
            // Use NgZone to ensure dialog close triggers change detection
            this.#ngZone.run(() => {
                console.log('Closing dialog...');
                this.#dialogRef.close(true);
                console.log('Dialog close called');
            });
        } catch (error) {
            console.error('Failed to save browser profile:', error);
            this.#ngZone.run(() => {
                this.#dialog.open(AlertDialogComponent, {
                    data: { message: `Failed to save profile: ${error instanceof Error ? error.message : error}` },
                });
            });
        }
    }

    #cleanObject<T extends object>(obj: T): T | undefined {
        const cleaned = Object.fromEntries(
            Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '')
        ) as T;
        return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }
}
