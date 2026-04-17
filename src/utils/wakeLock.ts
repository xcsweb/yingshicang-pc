export class WakeLockManager {
  private wakeLock: any = null;
  private active = false;

  public async request() {
    this.active = true;
    await this.acquire();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public release() {
    this.active = false;
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch (e) {}
      this.wakeLock = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private acquire = async () => {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          console.log('Screen Wake Lock released');
          this.wakeLock = null;
        });
      }
    } catch (err: any) {
      console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
    }
  }

  private handleVisibilityChange = () => {
    if (this.wakeLock === null && document.visibilityState === 'visible' && this.active) {
      this.acquire();
    }
  }
}

export const wakeLockManager = new WakeLockManager();