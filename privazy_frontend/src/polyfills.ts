import { Buffer as BrowserBuffer } from 'buffer';
import * as nodeProcess from 'process';

globalThis.Buffer = BrowserBuffer;
globalThis.process = globalThis.process || nodeProcess;

export {};
