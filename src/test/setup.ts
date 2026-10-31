import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// The 1s default is too short for app-level waits on a busy CI runner. Passing tests don't wait this long.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no PointerEvent, so without this pointer tests would lose clientX and friends.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

for (const target of [window, document.defaultView, globalThis]) {
  Object.defineProperty(target, 'PointerEvent', {
    value: TestPointerEvent,
    configurable: true,
    writable: true,
  });
}

// jsdom doesn't implement object URLs either.
URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
});
