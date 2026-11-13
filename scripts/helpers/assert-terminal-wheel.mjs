/** 在真实 WASM / Canvas 上检查滚轮输出；调用方将函数序列化到隔离 Electron 页面。 */
export function assertTerminalWheel(surface, check) {
  const terminal = surface.terminal;
  const input = [];
  const subscription = terminal.onData(data => input.push(data));
  const canvas = surface.element.querySelector('canvas');
  const wheel = (options = {}) => {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: 1,
      clientX: rect.left + rect.width / terminal.cols * 2.5,
      clientY: rect.top + rect.height / terminal.rows * 1.5,
      bubbles: true, cancelable: true, ...options,
    }));
  };
  const expectInput = (expected, label) => {
    check(input.join('') === expected, `${label}: ${JSON.stringify(input)}`);
    input.length = 0;
  };

  try {
    surface.write('\x1B[?1049h\x1B[?1000h\x1B[?1006h');
    check(terminal.hasMouseTracking() && terminal.getMode(1006), 'WASM did not enable requested mouse protocols');
    wheel({ deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: -40 });
    check(input.length > 0 && input.every(data => /^(?:\x1B\[<64;3;2M)+$/.test(data)),
      `Mouse-enabled wheel sent arrow keys instead of SGR mouse reports: ${JSON.stringify(input)}`);
    input.length = 0;
    wheel(); expectInput('\x1B[<65;3;2M', 'SGR wheel down / cell coordinates');
    wheel({ ctrlKey: true, altKey: true }); expectInput('\x1B[<89;3;2M', 'Mouse modifiers');
    wheel({ deltaY: 0, deltaX: 80 }); expectInput('', 'Horizontal wheel must not become arrow up');
    wheel({ deltaMode: WheelEvent.DOM_DELTA_PAGE });
    expectInput('\x1B[<65;3;2M'.repeat(terminal.rows), 'Page wheel must use visible rows');

    // 触控板的小事件要累积，既不能丢失，也不能每个像素都发送整行。
    const quarterLine = terminal.renderer.getMetrics().height / 4;
    for (let index = 0; index < 3; index++) wheel({ deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: quarterLine });
    expectInput('', 'Trackpad moved before accumulating one line');
    wheel({ deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: quarterLine });
    expectInput('\x1B[<65;3;2M', 'Trackpad lost accumulated movement');

    for (const mode of [1002, 1003]) {
      surface.write(`\x1B[?1000l\x1B[?${mode}h`);
      wheel(); expectInput('\x1B[<65;3;2M', `Mouse tracking mode ${mode}`);
      surface.write(`\x1B[?${mode}l`);
    }
    surface.write('\x1B[?1000h\x1B[?1016h');
    const rect = canvas.getBoundingClientRect();
    wheel({ clientX: rect.left + 10.25, clientY: rect.top + 12.25 });
    expectInput('\x1B[<65;11;13M', 'Pixel mouse coordinates must not use cells or DPR');
    surface.write('\x1B[?1016l\x1B[?1006l\x1B[?1015h');
    wheel(); expectInput('\x1B[97;3;2M', 'URXVT mouse encoding');
    surface.write('\x1B[?1015l');
    wheel(); expectInput('\x1B[Ma#"', 'Legacy mouse encoding');
    surface.write('\x1B[?1005h');
    wheel(); expectInput('\x1B[Ma#"', 'UTF-8 mouse encoding');

    // 备用屏幕仅在 CLI 允许时模拟方向键，并遵循 application cursor 模式。
    surface.write('\x1B[?1005l\x1B[?1000l\x1B[?1007l');
    wheel(); expectInput('', 'Disabled alternate scroll still sent arrow keys');
    surface.write('\x1B[?1007h\x1B[?1h');
    wheel(); expectInput('\x1BOB', 'Application cursor mode ignored');
    surface.write('\x1B[?1l');
    wheel({ deltaY: -1 }); expectInput('\x1B[A', 'Normal cursor mode ignored');
    surface.setReadOnly(true);
    wheel(); expectInput('', 'Read-only alternate screen sent input');
    surface.setReadOnly(false);

    surface.write('\x1B[?1049l');
    surface.write(Array.from({ length: 80 }, (_, index) => `wheel-history-${index}\r\n`).join(''));
    terminal.scrollToBottom();
    wheel({ deltaY: -3 });
    expectInput('', 'Shell scrollback generated CLI input');
    check(terminal.getViewportY() === 3, 'Shell wheel did not scroll history');
    terminal.scrollToBottom();
    surface.write('\x1B[?1000h\x1B[?1006h');
    wheel(); expectInput('\x1B[<65;3;2M', 'Normal screen ignored mouse reporting');
    wheel({ deltaY: -2, shiftKey: true }); expectInput('', 'Shift+wheel sent CLI input');
    check(terminal.getViewportY() === 2, 'Shift+wheel did not scroll local history');
    surface.setReadOnly(true);
    wheel({ deltaY: -2 }); expectInput('', 'Read-only mouse tracking sent input');
    check(terminal.getViewportY() === 4, 'Read-only wheel did not scroll history');
  } finally {
    subscription.dispose();
    surface.setReadOnly(false);
    terminal.reset();
  }
}
