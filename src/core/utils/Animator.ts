import { Logger } from './Logger';

export class Animator {
  private static instance: Animator;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('Animator');
  }

  static getInstance(): Animator {
    if (!Animator.instance) {
      Animator.instance = new Animator();
    }
    return Animator.instance;
  }

  // Spinner implementation
  createSpinner() {
    return new Spinner();
  }

  // ProgressBar implementation
  createProgressBar() {
    return new ProgressBar();
  }

  // RealTimeDisplay implementation
  createRealTimeDisplay() {
    return new RealTimeDisplay();
  }
}

class Spinner {
  private frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private isSpinning: boolean = false;
  private text: string = '';

  start(text: string = ''): void {
    if (this.isSpinning) return;

    this.text = text;
    this.isSpinning = true;

    this.intervalId = setInterval(() => {
      process.stdout.write(`\r${this.frames[this.currentFrame]} ${this.text}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  stop(): void {
    if (!this.isSpinning) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    process.stdout.write('\r\x1b[K'); // Clear the line
    this.isSpinning = false;
    this.currentFrame = 0;
  }

  succeed(text: string = ''): void {
    this.stop();
    const message = text || this.text;
    process.stdout.write(`\r✓ ${message}\n`);
  }

  fail(text: string = ''): void {
    this.stop();
    const message = text || this.text;
    process.stdout.write(`\r✗ ${message}\n`);
  }
}

class ProgressBar {
  render(current: number, total: number, label: string = ''): void {
    const percentage = Math.round((current / total) * 100);
    const filledLength = Math.round((current / total) * 20);
    const emptyLength = 20 - filledLength;

    const bar = '[' + '='.repeat(filledLength) + (filledLength < 20 ? '>' : '') + ' '.repeat(emptyLength) + ']';

    const labelText = label ? ` ${label}` : '';
    process.stdout.write(`\r${bar} ${percentage}%${labelText}`);

    if (current >= total) {
      process.stdout.write('\n');
    }
  }
}

class RealTimeDisplay {
  private sections: string[] = [];
  private isRunning: boolean = false;

  start(sections: string[]): void {
    this.sections = [...sections];
    this.isRunning = true;
    this.render();
  }

  update(sectionIndex: number, content: string): void {
    if (sectionIndex >= 0 && sectionIndex < this.sections.length) {
      this.sections[sectionIndex] = content;
      if (this.isRunning) {
        this.render();
      }
    }
  }

  private render(): void {
    // Move cursor to top-left and clear screen
    process.stdout.write('\x1b[H\x1b[J');

    // Render each section
    for (let i = 0; i < this.sections.length; i++) {
      process.stdout.write(this.sections[i] + '\n');
    }
  }

  stop(): void {
    this.isRunning = false;
    // Clear display
    process.stdout.write('\x1b[H\x1b[J');
  }
}