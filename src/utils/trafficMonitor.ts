export type TrafficStats = {
  domesticUp: number;
  domesticDown: number;
  intlUp: number;
  intlDown: number;
};

type Listener = (stats: TrafficStats) => void;

const safeJsonParse = (text: string): any => {
  try { return JSON.parse(text); } catch { return null; }
};

class TrafficMonitor {
  private stats: TrafficStats = { domesticUp: 0, domesticDown: 0, intlUp: 0, intlDown: 0 };
  private listeners: Set<Listener> = new Set();
  private active = false;
  private hostGeoCache = new Map<string, boolean>();
  private patched = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.active = safeJsonParse(localStorage.getItem('yingshicang-pc:trafficStats') || 'false');
      this.patch();
    }
  }

  private async isDomestic(url: string): Promise<boolean> {
    try {
      const u = new URL(url, window.location.origin);
      const host = u.hostname;
      if (this.hostGeoCache.has(host)) return this.hostGeoCache.get(host)!;
      
      if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.cn')) {
        this.hostGeoCache.set(host, true);
        return true;
      }

      fetch(`https://ipwhois.app/json/${host}`)
        .then(r => r.json())
        .then(data => {
          const isCN = data.country_code === 'CN' || data.country_code === 'HK' || data.country_code === 'MO' || data.country_code === 'TW';
          this.hostGeoCache.set(host, isCN);
        })
        .catch(() => {
          this.hostGeoCache.set(host, true); // 默认国内
        });
        
      return true;
    } catch {
      return true;
    }
  }

  public record(url: string, up: number, down: number) {
    if (!this.active) return;
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    
    this.isDomestic(url).then(isDom => {
      if (isDom) {
        this.stats.domesticUp += up;
        this.stats.domesticDown += down;
      } else {
        this.stats.intlUp += up;
        this.stats.intlDown += down;
      }
      this.notify();
    });
  }

  private notify() {
    const copy = { ...this.stats };
    this.listeners.forEach(l => l(copy));
  }

  public subscribe(l: Listener) {
    this.listeners.add(l);
    l({ ...this.stats });
    return () => this.listeners.delete(l);
  }

  public setEnabled(enabled: boolean) {
    this.active = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('yingshicang-pc:trafficStats', JSON.stringify(enabled));
    }
    if (!enabled) {
      this.stats = { domesticUp: 0, domesticDown: 0, intlUp: 0, intlDown: 0 };
      this.notify();
    }
  }
  
  public getEnabled() {
    return this.active;
  }

  private patch() {
    if (this.patched) return;
    this.patched = true;

    const self = this;
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : String(args[0]));
      const upSize = reqUrl.length + 400; // 预估请求头大小
      
      try {
        const res = await origFetch.apply(this, args);
        const cl = res.headers.get('content-length');
        const downSize = cl ? parseInt(cl, 10) : 2048; // fallback
        self.record(reqUrl, upSize, downSize);
        return res;
      } catch (e) {
        throw e;
      }
    };

    const origXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new origXHR();
      let url = '';
      let upSize = 400;
      
      const origOpen = xhr.open;
      xhr.open = function(...args: any[]) {
        url = args[1] as string;
        upSize += url.length;
        return origOpen.apply(this, args as any);
      };
      
      const origSend = xhr.send;
      xhr.send = function(body) {
        if (body) {
          if (typeof body === 'string') upSize += body.length;
          else if (body instanceof Blob) upSize += body.size;
          else if (body instanceof ArrayBuffer) upSize += body.byteLength;
        }
        return origSend.apply(this, [body]);
      };
      
      xhr.addEventListener('load', function() {
        let downSize = 2048;
        const cl = xhr.getResponseHeader('content-length');
        if (cl) {
          downSize = parseInt(cl, 10);
        } else if (xhr.responseType === 'arraybuffer' && xhr.response) {
          downSize = xhr.response.byteLength;
        } else if (xhr.responseType === 'blob' && xhr.response) {
          downSize = xhr.response.size;
        } else if (xhr.responseText) {
          downSize = xhr.responseText.length;
        }
        self.record(url, upSize, downSize);
      });
      
      return xhr;
    } as any;
  }
}

export const trafficMonitor = new TrafficMonitor();
