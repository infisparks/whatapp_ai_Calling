declare module 'ws' {
  import { EventEmitter } from 'events';

  export class WebSocket extends EventEmitter {
    static OPEN: number;
    static CONNECTING: number;
    static CLOSING: number;
    static CLOSED: number;

    readyState: number;

    constructor(address: string | URL, options?: any);
    send(data: any, cb?: (err?: Error) => void): void;
    close(code?: number, data?: string): void;
    ping(data?: any, mask?: boolean, cb?: (err?: Error) => void): void;
  }

  export namespace WebSocket {
    export type Data = string | Buffer | ArrayBuffer | Buffer[];
  }

  export default WebSocket;
}
