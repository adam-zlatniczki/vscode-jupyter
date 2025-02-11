// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Resource } from '../../platform/common/types';
import { Telemetry } from '../../platform/common/constants';
import { sendTelemetryEvent, waitBeforeSending, IEventNamePropertyMapping, TelemetryEventInfo } from '../../telemetry';
import { getContextualPropsForTelemetry } from '../../platform/telemetry/telemetry';
import { clearInterruptCounter } from './helper';
import { InterruptResult } from '../types';
import { ExcludeType, PickType, UnionToIntersection } from '../../platform/common/utils/misc';

/**
 * @param {(P[E] & { waitBeforeSending: Promise<void> })} [properties]
 * Can optionally contain a property `waitBeforeSending` referencing a promise.
 * Which must be awaited before sending the telemetry.
 */

export function sendKernelTelemetryEvent<P extends IEventNamePropertyMapping, E extends keyof P>(
    resource: Resource,
    eventName: E,
    measures?:
        | (P[E] extends TelemetryEventInfo<infer R> ? Partial<PickType<UnionToIntersection<R>, number>> : undefined)
        | undefined,
    properties?: P[E] extends TelemetryEventInfo<infer R>
        ? ExcludeType<R, number> extends never | undefined
            ? undefined | { [waitBeforeSending]?: Promise<void> }
            : Partial<ExcludeType<R, number>> & { [waitBeforeSending]?: Promise<void> }
        : undefined | { [waitBeforeSending]?: Promise<void> } | (undefined | { [waitBeforeSending]?: Promise<void> }),
    ex?: Error | undefined
) {
    getContextualPropsForTelemetry(resource)
        .then((props) => {
            Object.assign(props, properties || {});
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sendTelemetryEvent(eventName as any, measures as any, props as any, ex);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resetData(resource, eventName as any, props);
        })
        .ignoreErrors();
}

/**
 * Some information such as interrupt counters & restart counters need to be reset
 * after we have successfully interrupted or restarted a kernel.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resetData(resource: Resource, eventName: string, properties: any) {
    // Once we have successfully interrupted, clear the interrupt counter.
    if (eventName === Telemetry.NotebookInterrupt) {
        let kv: Pick<IEventNamePropertyMapping, Telemetry.NotebookInterrupt>;
        const data: undefined | typeof kv[Telemetry.NotebookInterrupt] = properties;
        // Check result to determine if success.
        if (data && 'result' in data && data['result'] === InterruptResult.Success) {
            clearInterruptCounter(resource);
        }
    }
    // Once we have successfully restarted, clear the interrupt counter.
    if (eventName === Telemetry.NotebookRestart) {
        let kv: Pick<IEventNamePropertyMapping, Telemetry.NotebookRestart>;
        const data: undefined | typeof kv[Telemetry.NotebookRestart] = properties;
        // For restart to be successful, we should not have `failed`
        const failed = data && 'failed' in data ? data['failed'] : false;
        if (!failed) {
            clearInterruptCounter(resource);
        }
    }
}
