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

    command(cmd: ReDNATCOMspApi.Command) {
        this.check();
        this.target!.command(cmd);
    }

    event(evt: ReDNATCOMspApi.Event) {
        if (this.onEvent)
            this.onEvent(evt);
    }

    init(elemId: string, onEvent?: (evt: ReDNATCOMspApi.Event) => void, onInited?: () => void) {
        this.onEvent = onEvent;
        ReDNATCOMsp.init(elemId, onInited);
        return this;
    }

    isReady(): boolean {
        return !!this.target;
    }

    loadStructure(data: string, type: 'cif'|'pdb') {
        this.check();
        this.target!.loadStructure(data, type);
    }

    query(type: ReDNATCOMspApi.Queries.Type): ReDNATCOMspApi.Response {
        this.check();
        return this.target!.apiQuery(type);
    }
}
