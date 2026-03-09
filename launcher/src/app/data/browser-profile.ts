export interface BasicInfo {
    profileName: string | null;
    groupName?: string | null;
    description?: string | null;
}

export interface BotProfileInfo {
    filename: string | null;
    content?: string | null;
}

export enum BrowserProfileStatus {
    Idle,
    Launching,
    LaunchFailed,
    Running,
    Stopping,
    StopFailed,
}

export const BrowserProfileStatusText = {
    [BrowserProfileStatus.Idle]: 'Idle',
    [BrowserProfileStatus.Launching]: 'Launching',
    [BrowserProfileStatus.LaunchFailed]: 'Launch Failed',
    [BrowserProfileStatus.Running]: 'Running',
    [BrowserProfileStatus.Stopping]: 'Stopping',
    [BrowserProfileStatus.StopFailed]: 'Stop Failed',
};

export function getBrowserProfileStatusText(status: BrowserProfileStatus): string {
    return BrowserProfileStatusText[status];
}

// Browser brand options
export type BrowserBrand = 'chrome' | 'chromium' | 'edge' | 'brave' | 'opera' | 'webview';
export const BrowserBrands: BrowserBrand[] = ['chrome', 'chromium', 'edge', 'brave', 'opera', 'webview'];

// Platform options
export type Platform = 'Windows' | 'Android' | 'macOS' | 'Linux';
export const Platforms: Platform[] = ['Windows', 'Android', 'macOS', 'Linux'];

// Architecture options
export type Architecture = 'x86' | 'arm' | 'arm64';
export const Architectures: Architecture[] = ['x86', 'arm', 'arm64'];

// Bitness options
export type Bitness = '32' | '64';
export const Bitnesses: Bitness[] = ['32', '64'];

// Profile/Real/Disabled options
export type ProfileRealDisabled = 'profile' | 'real' | 'disabled';
export const ProfileRealDisabledOptions: ProfileRealDisabled[] = ['profile', 'real', 'disabled'];

// Profile/Real options
export type ProfileReal = 'profile' | 'real';
export const ProfileRealOptions: ProfileReal[] = ['profile', 'real'];

// Font options
export type FontOption = 'profile' | 'expand' | 'real';
export const FontOptions: FontOption[] = ['profile', 'expand', 'real'];

// Media types options
export type MediaTypesOption = 'expand' | 'profile' | 'real';
export const MediaTypesOptions: MediaTypesOption[] = ['expand', 'profile', 'real'];

// Color scheme options
export type ColorScheme = 'light' | 'dark';
export const ColorSchemes: ColorScheme[] = ['light', 'dark'];

// Behavior toggles
export interface BehaviorToggles {
    botLocalDns?: boolean;
    botDisableDebugger?: boolean;
    botMobileForceTouch?: boolean;
    botAlwaysActive?: boolean;
    botInjectRandomHistory?: boolean;
    botDisableConsoleMessage?: boolean;
    botPortProtection?: boolean;
    botNetworkInfoOverride?: boolean;
}

// Identity & Locale config
export interface IdentityLocaleConfig {
    botConfigBrowserBrand?: BrowserBrand;
    botConfigBrandFullVersion?: string;
    botConfigUaFullVersion?: string;
    botConfigLanguages?: string;
    botConfigLocale?: string;
    botConfigTimezone?: string;
    botConfigLocation?: string;
}

// Custom User-Agent config
export interface CustomUserAgentConfig {
    userAgent?: string;
    botConfigPlatform?: Platform;
    botConfigPlatformVersion?: string;
    botConfigModel?: string;
    botConfigArchitecture?: Architecture;
    botConfigBitness?: Bitness;
    botConfigMobile?: boolean;
}

// Display & Input config
export interface DisplayInputConfig {
    botConfigWindow?: ProfileReal;
    botConfigScreen?: ProfileReal;
    botConfigKeyboard?: ProfileReal;
    botConfigFonts?: FontOption;
    botConfigColorScheme?: ColorScheme;
    botConfigDisableDeviceScaleFactor?: boolean;
}

// Noise config
export interface NoiseConfig {
    botConfigNoiseWebglImage?: boolean;
    botConfigNoiseCanvas?: boolean;
    botConfigNoiseAudioContext?: boolean;
    botConfigNoiseClientRects?: boolean;
    botConfigNoiseTextRects?: boolean;
    botNoiseSeed?: number;
    botTimeScale?: number;
    botFps?: string;
    botTimeSeed?: number;
    botStackSeed?: string;
}

// Rendering & Media config
export interface RenderingMediaConfig {
    botConfigWebgl?: ProfileRealDisabled;
    botConfigWebgpu?: ProfileRealDisabled;
    botConfigSpeechVoices?: ProfileReal;
    botConfigMediaDevices?: ProfileReal;
    botConfigMediaTypes?: MediaTypesOption;
    botConfigWebrtc?: ProfileRealDisabled;
    botWebrtcIce?: string;
}

// Proxy config
export interface ProxyConfig {
    proxyServer?: string;
    proxyIp?: string;
    botIpService?: string;
    proxyBypassRgx?: string;
}

// Advanced config
export interface AdvancedConfig {
    botCookies?: string;
    botBookmarks?: string;
    botCustomHeaders?: string;
}

// Launch options (all CLI flags combined)
export interface LaunchOptions {
    behavior?: BehaviorToggles;
    identityLocale?: IdentityLocaleConfig;
    customUserAgent?: CustomUserAgentConfig;
    displayInput?: DisplayInputConfig;
    noise?: NoiseConfig;
    renderingMedia?: RenderingMediaConfig;
    proxy?: ProxyConfig;
    advanced?: AdvancedConfig;
}

export interface BrowserProfile {
    id: string;
    basicInfo: Partial<BasicInfo>;
    botProfileInfo: Partial<BotProfileInfo>;
    binaryPath?: string; // Deprecated, kept for backward compatibility
    proxyServer?: string;
    createdAt: number;
    updatedAt: number;
    warmupUrls?: string;
    lastUsedAt?: number;
    deletedAt?: number;
    launchOptions?: LaunchOptions;
}
