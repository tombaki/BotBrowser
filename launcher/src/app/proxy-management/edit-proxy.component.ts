import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { v4 as uuidv4 } from 'uuid';
import type { Proxy, ProxyType } from '../data/proxy';
import type { ParsedProxy } from '../shared/proxy-parser.service';
import { ProxyInputComponent } from '../shared/proxy-input.component';
import { ProxyService } from '../shared/proxy.service';

@Component({
    selector: 'app-edit-proxy',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        ProxyInputComponent,
    ],
    templateUrl: './edit-proxy.component.html',
    styleUrl: './edit-proxy.component.scss',
})
export class EditProxyComponent {
    readonly #proxyService = inject(ProxyService);
    readonly #dialogRef = inject(MatDialogRef<EditProxyComponent>);
    readonly #injectedData = inject<Proxy | undefined>(MAT_DIALOG_DATA);
    readonly #formBuilder = inject(FormBuilder);

    readonly isEdit = !!this.#injectedData;

    readonly nameFormGroup = this.#formBuilder.group({
        name: this.#injectedData?.name || '',
    });

    proxyValue: ParsedProxy | null = this.#injectedData
        ? {
              type: this.#injectedData.type,
              host: this.#injectedData.host,
              port: this.#injectedData.port,
              username: this.#injectedData.username,
              password: this.#injectedData.password,
          }
        : null;

    #currentProxyValue: ParsedProxy | null = this.proxyValue;

    onProxyValueChange(value: ParsedProxy | null): void {
        this.#currentProxyValue = value;

        // Auto-generate name if empty
        if (value && !this.nameFormGroup.value.name) {
            this.nameFormGroup.patchValue({ name: `${value.host}:${value.port}` });
        }
    }

    async onConfirmClick(): Promise<void> {
        const proxyData = this.#currentProxyValue;
        if (!proxyData?.host || !proxyData?.port) return;

        const proxy: Proxy = {
            id: this.#injectedData?.id || uuidv4(),
            name: this.nameFormGroup.value.name || '',
            type: (proxyData.type as ProxyType) || 'http',
            host: proxyData.host,
            port: proxyData.port,
            username: proxyData.username || undefined,
            password: proxyData.password || undefined,
        };

        if (this.isEdit) {
            await this.#proxyService.updateProxy(proxy);
        } else {
            await this.#proxyService.addProxy(proxy);
        }

        this.#dialogRef.close(proxy.id);
    }
}
