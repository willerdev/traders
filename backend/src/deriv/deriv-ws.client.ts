import WebSocket from 'ws';

const WsCtor =
  (WebSocket as unknown as { default?: typeof WebSocket }).default ?? WebSocket;

type DerivMsg = {
  msg_type?: string;
  req_id?: number;
  error?: { code?: string; message?: string };
  [key: string]: unknown;
};

export class DerivWsClient {
  private constructor(
    private readonly ws: WebSocket,
    private nextId = 1,
  ) {}

  static connect(
    endpoint: string,
    options?: { origin?: string },
  ): Promise<DerivWsClient> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      const origin = options?.origin?.replace(/\/$/, '');
      const ws = new WsCtor(endpoint, {
        origin,
        headers,
      });
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('Deriv WebSocket timed out'));
      }, 15_000);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve(new DerivWsClient(ws));
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async request<T = DerivMsg>(payload: Record<string, unknown>): Promise<T> {
    const req_id = this.nextId++;
    const body = { ...payload, req_id };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws.off('message', onMessage);
        reject(new Error('Deriv request timed out'));
      }, 20_000);

      const onMessage = (raw: WebSocket.RawData) => {
        let msg: DerivMsg;
        try {
          msg = JSON.parse(String(raw)) as DerivMsg;
        } catch {
          return;
        }
        if (msg.req_id !== req_id) return;
        this.ws.off('message', onMessage);
        clearTimeout(timer);
        if (msg.error?.message) {
          reject(new Error(msg.error.message));
          return;
        }
        resolve(msg as T);
      };

      this.ws.on('message', onMessage);
      this.ws.send(JSON.stringify(body));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}
