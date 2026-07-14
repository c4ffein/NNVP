export default class {
  constructor(boardInterface, kerasInterface) {
    const isApple = navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i);
    const inputs = ['input', 'select', 'button', 'textarea'];

    const isModKeyPressed = (event) => {
      if (isApple) {
        return event.metaKey;
      }
      return event.ctrlKey;
    };

    // Need to listen to keypress for exemple for Cmd-Z on Safari,
    // which doesn't prevent default behaviour with keydown...
    const onKeyPress = (event) => {
      if (document.activeElement && inputs.includes(document.activeElement.tagName.toLowerCase())) {
        return false;
      }

      const modKeyPressed = isModKeyPressed(event);

      switch (event.code) {
        case 'Delete':
          boardInterface.deleteSelectedElements();
          break;
        case 'KeyZ':
          if (modKeyPressed) {
            event.preventDefault();
            if (event.shiftKey) {
              boardInterface.redo();
            } else {
              boardInterface.undo();
            }
          }
          break;
        case 'KeyY':
          if (modKeyPressed) {
            boardInterface.redo();
            event.preventDefault();
          }
          break;
        case 'KeyG':
          if (modKeyPressed) {
            boardInterface.createGroup();
            event.preventDefault();
          }
          break;
        case 'KeyL':
          if (modKeyPressed) {
            boardInterface.autoLayout();
            event.preventDefault();
          }
          break;
        case 'KeyO':
          if (modKeyPressed) {
            boardInterface.loadBoard();
            event.preventDefault();
          }
          break;
        case 'KeyS':
          if (modKeyPressed) {
            boardInterface.saveBoard();
            event.preventDefault();
          }
          break;
        case 'KeyX':
          if (modKeyPressed) {
            boardInterface.generatePython(kerasInterface);
            event.preventDefault();
          }
          break;
        default:
          return false;
      }
      return true;
    };
    window.addEventListener('keypress', onKeyPress);

    // Need to listen to keydown for exemple for backspace on Chrome, don't send event otherwise
    const onKeyDown = (event) => {
      if (document.activeElement && inputs.includes(document.activeElement.tagName.toLowerCase())) {
        return false;
      }

      switch (event.code) {
        case 'Backspace':
        case 'Delete':
          boardInterface.deleteSelectedElements();
          break;
        default:
          return false;
      }
      return true;
    };
    window.addEventListener('keydown', onKeyDown);
  }
}
