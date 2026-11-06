/** 使用 Chromium 原生 IME 通道，避免仅派发 compositionend 而绕过真实输入流程。 */
export async function assertTerminalIme(webContents) {
  const evaluate = script => webContents.executeJavaScript(script);
  await evaluate(`(async () => {
    for (let i = 0; i < 150 && !window.newSurface; i++) await new Promise(resolve => setTimeout(resolve, 20));
    const host = document.createElement('div'); host.id = 'ime-fixture'; host.style.cssText = 'width:600px;height:240px'; document.body.append(host);
    const surface = await window.newSurface(); host.append(surface.element); surface.fit(); surface.write('IME> \x1B[6;11H');
    window.imeFixture = { surface, input: [], events: [] };
    surface.terminal.onData(data => window.imeFixture.input.push(data));
    for (const type of ['focusin', 'keydown', 'compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input']) {
      host.addEventListener(type, event => window.imeFixture.events.push({ type, data: event.data, inputType: event.inputType, prevented: event.defaultPrevented }));
    }
    surface.element.scrollIntoView({ block: 'center' });
  })()`);
  webContents.debugger.attach('1.3');
  const clickTerminal = async () => {
    const point = await evaluate(`(() => { const rect = window.imeFixture.surface.element.querySelector('canvas').getBoundingClientRect(); return { x: Math.round(rect.left + 25), y: Math.round(rect.top + 25) }; })()`);
    // sendInputEvent 在隐藏窗口可能不派发鼠标事件；CDP 点击走真实命中和选区监听。
    await webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    const focus = await evaluate(`({ editable: document.activeElement === window.imeFixture.surface.terminal.textarea, tag: document.activeElement?.tagName, events: window.imeFixture.events })`);
    if (!focus.editable) throw Error('Clicking the terminal left IME without an editable target: ' + JSON.stringify(focus));
  };
  const checkAnchor = async (col, row, label) => {
    const anchor = await evaluate(`(() => {
      const terminal = window.imeFixture.surface.terminal;
      const canvas = terminal.renderer.getCanvas().getBoundingClientRect();
      const input = terminal.textarea.getBoundingClientRect();
      const cell = terminal.renderer.getMetrics();
      return { x: input.left - canvas.left, y: input.top - canvas.top, expectedX: ${col} * cell.width, expectedY: ${row} * cell.height, height: input.height, expectedHeight: cell.height };
    })()`);
    if (Math.abs(anchor.x - anchor.expectedX) > 1 || Math.abs(anchor.y - anchor.expectedY) > 1 || Math.abs(anchor.height - anchor.expectedHeight) > 1) {
      throw Error('IME candidate anchor is not near terminal cursor (' + label + '): ' + JSON.stringify(anchor));
    }
  };
  try {
    await clickTerminal();
    await checkAnchor(10, 5, 'initial click');
    await webContents.debugger.sendCommand('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
    await webContents.debugger.sendCommand('Input.imeSetComposition', { text: 'nihao', selectionStart: 5, selectionEnd: 5 });
    await webContents.debugger.sendCommand('Input.insertText', { text: '你好' });
    const result = await evaluate(`({ input: window.imeFixture.input, events: window.imeFixture.events, value: window.imeFixture.surface.terminal.textarea.value, focused: document.activeElement?.tagName })`);
    if (result.input.join('') !== '你好') throw Error('Native IME did not commit Chinese exactly once: ' + JSON.stringify(result));

    await evaluate(`(async () => {
      const canvas = window.imeFixture.surface.element.querySelector('canvas');
      canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 25, clientY: 25 }));
      await new Promise(resolve => setTimeout(resolve, 20));
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await webContents.debugger.sendCommand('Input.imeSetComposition', { text: 'ceshi', selectionStart: 5, selectionEnd: 5 });
    await checkAnchor(10, 5, 'after native copy menu');
    await webContents.debugger.sendCommand('Input.insertText', { text: '测试' });
    const committed = await evaluate(`window.imeFixture.input.join('')`);
    if (committed !== '你好测试') throw Error('Chinese input changed after restoring the anchor: ' + JSON.stringify(committed));

    await evaluate(`window.imeFixture.surface.write('abc');`);
    await checkAnchor(13, 5, 'same-line cursor move');
    await evaluate(`window.imeFixture.surface.write('\\r\\n');`);
    await checkAnchor(0, 6, 'newline');
    await evaluate(`document.querySelector('#ime-fixture').style.width = '320px'; window.imeFixture.surface.fit(); window.imeFixture.surface.write('\\x1B[4;9H');`);
    await checkAnchor(8, 3, 'resized terminal');

    // 覆盖“重启后能输入，再点一下或切回会话就失效”的复发路径。
    for (let attempt = 0; attempt < 3; attempt++) {
      await evaluate(`document.querySelector('#outside').focus();`);
      if (attempt === 1) await evaluate(`window.imeFixture.surface.element.remove(); document.querySelector('#ime-fixture').append(window.imeFixture.surface.element);`);
      await clickTerminal();
      await webContents.debugger.sendCommand('Input.imeSetComposition', { text: 'huifu', selectionStart: 5, selectionEnd: 5 });
      await webContents.debugger.sendCommand('Input.insertText', { text: '恢复' });
      const input = await evaluate(`window.imeFixture.input.join('')`);
      if (input !== '你好测试' + '恢复'.repeat(attempt + 1)) throw Error('Chinese input failed after repeated click / remount: ' + JSON.stringify(input));
      await checkAnchor(8, 3, 'repeated composition');
    }

    // 焦点转发不能破坏 Canvas 的拖动选区；隔离剪贴板，避免改写用户实际剪贴板。
    const drag = await evaluate(`(() => {
      window.imeFixture.clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
      const terminal = window.imeFixture.surface.terminal;
      window.imeFixture.surface.write('\\x1B[Hselection text');
      const rect = terminal.renderer.getCanvas().getBoundingClientRect(), cell = terminal.renderer.getMetrics();
      return { x: rect.left + cell.width / 2, y: rect.top + cell.height / 2, endX: rect.left + 5.5 * cell.width };
    })()`);
    await webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: drag.x, y: drag.y });
    await webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: drag.endX, y: drag.y });
    await webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: drag.endX, y: drag.y });
    const selection = await evaluate(`({ text: window.imeFixture.surface.terminal.getSelection(), editable: document.activeElement === window.imeFixture.surface.terminal.textarea })`);
    if (!selection.text.startsWith('select') || !selection.editable) throw Error('Focus fix broke terminal selection: ' + JSON.stringify(selection));
  } finally {
    webContents.debugger.detach();
    await evaluate(`if (window.imeFixture.clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', window.imeFixture.clipboardDescriptor); else delete navigator.clipboard;`);
    await evaluate(`window.imeFixture.surface.dispose(); document.querySelector('#ime-fixture').remove(); delete window.imeFixture; document.querySelector('#outside').focus();`);
  }
}
