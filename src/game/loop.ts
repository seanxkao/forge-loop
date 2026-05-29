/** 固定步長遊戲迴圈：邏輯以固定 dt 推進，繪製每幀呼叫。 */
export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private running = false;
  readonly step: number;

  constructor(
    private update: (dt: number) => void,
    private render: () => void,
    stepSeconds = 1 / 30,
  ) {
    this.step = stepSeconds;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let elapsed = (now - this.last) / 1000;
    this.last = now;
    // 分頁切回 / 卡頓時避免一次補太多步
    if (elapsed > 0.25) elapsed = 0.25;
    this.accumulator += elapsed;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }
    this.render();
    requestAnimationFrame(this.frame);
  };
}
