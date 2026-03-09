import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, NgZone, Output } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProxyTypes } from '../data/proxy';
import type { ProxyType } from '../data/proxy';
import * as Neutralino from '@neutralinojs/lib';
import { ProxyCheckService, type ProxyCheckResult } from './proxy-check.service';
import { ProxyParserService, type ParsedProxy } from './proxy-parser.service';

@Component({
    selector: 'app-proxy-input',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatTooltipModule,
    ],
    template: `
        @if (showQuickParse) {
            <div class="quick-parse-section">
                <mat-form-field>
                    <mat-label>Quick Parse</mat-label>
                    <input
                        matInput
                        placeholder="Paste proxy string (e.g., socks5://user:pass@host:port)"
                        [(ngModel)]="quickParseInput"
                        (input)="onQuickParseInput()"
                    />
                    <mat-hint>Formats: scheme://user:pass&#64;host:port, host:port:user:pwd, etc.</mat-hint>
                </mat-form-field>
                <div class="parse-status">
                    @if (parseError) {
                        <span class="parse-error">{{ parseError }}</span>
                    }
                    @if (parseSuccess) {
                        <span class="parse-success">Parsed successfully</span>
                    }
                </div>
            </div>
        }

        <form [formGroup]="formGroup">
            <div class="host-port-row">
                <mat-form-field class="type-field">
                    <mat-label>Type</mat-label>
                    <mat-select formControlName="type" (selectionChange)="onFormChange()">
                        @for (type of proxyTypes; track type) {
                            <mat-option [value]="type">{{ type }}</mat-option>
                        }
                    </mat-select>
                </mat-form-field>

                <mat-form-field class="host-field">
                    <mat-label>Host</mat-label>
                    <input matInput formControlName="host" placeholder="proxy.example.com" (input)="onFormChange()" />
                </mat-form-field>

                <mat-form-field class="port-field">
                    <mat-label>Port</mat-label>
                    <input matInput formControlName="port" type="number" placeholder="8080" (input)="onFormChange()" />
                </mat-form-field>
            </div>

            <div class="host-port-row">
                <mat-form-field class="host-field">
                    <mat-label>Username</mat-label>
                    <input matInput formControlName="username" (input)="onFormChange()" />
                </mat-form-field>

                <mat-form-field class="host-field">
                    <mat-label>Password</mat-label>
                    <input matInput formControlName="password" (input)="onFormChange()" />
                </mat-form-field>
            </div>
        </form>

        @if (showCheckButton || showSaveButton || showClearButton) {
            <div class="check-ip-section">
                <div class="button-row">
                    @if (showCheckButton) {
                        <button mat-stroked-button (click)="onCheckIp()" [disabled]="checking || !getValue()">
                            @if (checking) {
                                <mat-spinner diameter="18"></mat-spinner>
                                <span>Checking...</span>
                            } @else {
                                <span>Check IP</span>
                            }
                        </button>
                    }
                    @if (showSaveButton && getValue()) {
                        <button mat-stroked-button (click)="onSaveToList()">
                            Save to proxy list
                        </button>
                    }
                    @if (showClearButton && getValue()) {
                        <button mat-stroked-button color="warn" (click)="onClearProxy()">
                            Clear proxy
                        </button>
                    }
                </div>

                @if (checkError) {
                    <div class="check-result check-error">{{ checkError }}</div>
                }

                @if (checkResult) {
                    <div class="check-result check-success">
                        <div class="result-row">
                            <span class="result-label">IP:</span>
                            <span class="result-value">{{ checkResult.ip }}</span>
                            <button
                                mat-icon-button
                                class="copy-btn"
                                (click)="copyToClipboard(checkResult.ip)"
                                [matTooltip]="copyTooltip"
                            >
                                <mat-icon>content_copy</mat-icon>
                            </button>
                        </div>
                        <div class="result-row">
                            <span class="result-label">Location:</span>
                            <span class="result-value"
                                >{{ checkResult.country }}{{ checkResult.region ? ', ' + checkResult.region : ''
                                }}{{ checkResult.city ? ', ' + checkResult.city : '' }}</span
                            >
                        </div>
                        <div class="result-row">
                            <span class="result-label">ISP:</span>
                            <span class="result-value">{{ checkResult.isp }}</span>
                        </div>
                        @if (checkResult.org && checkResult.org !== checkResult.isp) {
                            <div class="result-row">
                                <span class="result-label">Org:</span>
                                <span class="result-value">{{ checkResult.org }}</span>
                            </div>
                        }
                        <div class="result-row">
                            <span class="result-label">Type:</span>
                            <span class="result-value" [class.hosting-warning]="checkResult.hosting">
                                {{ checkResult.hosting ? 'Datacenter / Hosting' : 'Residential / ISP' }}
                            </span>
                        </div>
                    </div>
                }
            </div>
        }
    `,
    styles: `
        :host {
            display: block;
        }

        .quick-parse-section {
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.12);

            mat-form-field {
                width: 100%;
            }

            .parse-status {
                margin-top: 8px;
                font-size: 12px;
                line-height: 1.4;
            }

            .parse-error {
                color: #f44336;
            }

            .parse-success {
                color: #4caf50;
            }
        }

        form {
            display: flex;
            flex-direction: column;
            gap: 4px;

            mat-form-field {
                width: 100%;
            }

            .host-port-row {
                display: flex;
                gap: 16px;

                .type-field {
                    flex: 0 0 130px;
                }

                .host-field {
                    flex: 3;
                }

                .port-field {
                    flex: 1;
                }
            }
        }

        .check-ip-section {
            margin-top: 12px;

            .button-row {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            button {
                display: inline-flex;
                align-items: center;
                gap: 8px;

                mat-spinner {
                    width: 18px !important;
                    height: 18px !important;
                    flex-shrink: 0;
                }
            }

            .check-result {
                margin-top: 12px;
                padding: 12px;
                border-radius: 4px;
                font-size: 13px;
                line-height: 1.6;
            }

            .check-error {
                background: rgba(244, 67, 54, 0.08);
                color: #d32f2f;
                border: 1px solid rgba(244, 67, 54, 0.2);
            }

            .check-success {
                background: rgba(76, 175, 80, 0.06);
                border: 1px solid rgba(76, 175, 80, 0.2);
            }

            .result-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .copy-btn {
                width: 24px;
                height: 24px;
                padding: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;

                mat-icon {
                    font-size: 14px;
                    width: 14px;
                    height: 14px;
                    line-height: 14px;
                }
            }

            .result-label {
                font-weight: 500;
                color: rgba(0, 0, 0, 0.6);
                min-width: 65px;
            }

            .result-value {
                color: rgba(0, 0, 0, 0.87);
            }

            .hosting-warning {
                color: #f57c00;
                font-weight: 500;
            }
        }
    `,
})
export class ProxyInputComponent {
    readonly #proxyParser = inject(ProxyParserService);
    readonly #proxyCheck = inject(ProxyCheckService);
    readonly #formBuilder = inject(FormBuilder);
    readonly #ngZone = inject(NgZone);

    readonly proxyTypes = ProxyTypes;

    @Input() showQuickParse = true;
    @Input() showCheckButton = false;
    @Input() showSaveButton = false;
    @Input() showClearButton = false;
    @Input() set value(v: ParsedProxy | null) {
        if (v) {
            this.formGroup.patchValue(
                {
                    type: v.type,
                    host: v.host,
                    port: v.port,
                    username: v.username || '',
                    password: v.password || '',
                },
                { emitEvent: false }
            );
        } else {
            this.formGroup.reset(
                { type: 'http', host: '', port: 8080, username: '', password: '' },
                { emitEvent: false }
            );
        }
    }

    @Output() valueChange = new EventEmitter<ParsedProxy | null>();
    @Output() ipCheckResult = new EventEmitter<ProxyCheckResult>();
    @Output() saveToList = new EventEmitter<ParsedProxy>();
    @Output() clearProxy = new EventEmitter<void>();
    quickParseInput = '';
    parseError = '';
    parseSuccess = false;

    checking = false;
    checkResult: ProxyCheckResult | null = null;
    checkError = '';
    copyTooltip = 'Copy IP';

    readonly formGroup = this.#formBuilder.group({
        type: 'http' as ProxyType,
        host: '',
        port: 8080,
        username: '',
        password: '',
    });

    onQuickParseInput(): void {
        this.parseError = '';
        this.parseSuccess = false;

        if (!this.quickParseInput.trim()) {
            return;
        }

        const result = this.#proxyParser.parse(this.quickParseInput);
        if (result) {
            this.formGroup.patchValue({
                type: result.type,
                host: result.host,
                port: result.port,
                username: result.username || '',
                password: result.password || '',
            });
            this.parseSuccess = true;
            this.#emitValue();
        } else {
            this.parseError = 'Could not parse proxy string';
        }
    }

    onFormChange(): void {
        this.#emitValue();
    }

    async onCheckIp(): Promise<void> {
        const proxy = this.getValue();
        if (!proxy) return;

        this.checking = true;
        this.checkResult = null;
        this.checkError = '';

        try {
            const result = await this.#proxyCheck.checkProxy(proxy);
            this.#ngZone.run(() => {
                this.checkResult = result;
                this.checking = false;
                this.ipCheckResult.emit(result);
            });
        } catch (error) {
            this.#ngZone.run(() => {
                this.checkError = error instanceof Error ? error.message : 'Check failed';
                this.checking = false;
            });
        }
    }

    async copyToClipboard(text: string): Promise<void> {
        try {
            await Neutralino.clipboard.writeText(text);
            this.#ngZone.run(() => {
                this.copyTooltip = 'Copied!';
                setTimeout(() => {
                    this.#ngZone.run(() => {
                        this.copyTooltip = 'Copy IP';
                    });
                }, 1500);
            });
        } catch {
            // fallback ignored
        }
    }

    onSaveToList(): void {
        const value = this.getValue();
        if (value) this.saveToList.emit(value);
    }

    onClearProxy(): void {
        this.formGroup.reset({ type: 'http', host: '', port: 8080, username: '', password: '' });
        this.checkResult = null;
        this.checkError = '';
        this.#emitValue();
        this.clearProxy.emit();
    }

    getValue(): ParsedProxy | null {
        const { type, host, port } = this.formGroup.value;
        if (!host || !port) {
            return null;
        }

        return {
            type: (type as ProxyType) || 'http',
            host: host,
            port: port,
            username: this.formGroup.value.username || undefined,
            password: this.formGroup.value.password || undefined,
        };
    }

    #emitValue(): void {
        this.valueChange.emit(this.getValue());
    }
}
