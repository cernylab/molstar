import { ReDNATCOMsp } from './index';
import { ReDNATCOMspApi } from './api';

export class ReDNATCOMspApiImpl implements ReDNATCOMspApi.Object {
    private target: ReDNATCOMsp|undefined = undefined;
    private onEvent: ((evt: ReDNATCOMspApi.Event) => void)|undefined;

    private check() {
        if (!this.target)
            throw new Error('ReDNATCOMsp object not bound');
    }

    _bind(target: ReDNATCOMsp) {
        this.target = target;
    }

    async command(cmd: ReDNATCOMspApi.Command) {
        this.check();
        this.target!.command(cmd);
    }

    event(evt: ReDNATCOMspApi.Event) {
        if (this.onEvent)
            this.onEvent(evt);
    }

    init(elemId: string, onEvent?: (evt: ReDNATCOMspApi.Event) => void) {
        this.onEvent = onEvent;
        ReDNATCOMsp.init(elemId);
        return this;
    }

    isReady(): boolean {
        return !!this.target;
    }

    loadStructure(coords: { data: string, type: 'cif'|'pdb' }, densityMap: { data: Uint8Array, type: 'ccp4'|'dsn6' }|null) {
        this.check();
        this.target!.loadStructure(coords, densityMap);
    }

    query<T extends ReDNATCOMspApi.Queries.Type>(type: T): ReDNATCOMspApi.ResponseTypes[T] {
        this.check();
        return this.target!.apiQuery(type) as ReDNATCOMspApi.ResponseTypes[T];
    }
}
