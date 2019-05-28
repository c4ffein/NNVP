export default class {
  constructor(d3Interface) {
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
          d3Interface.deleteSelectedElements();
          break;
        case 'KeyC':
          if (modKeyPressed) {
            console.log('Copy not implemented'); // eslint-disable-line
            event.preventDefault();
          }
          break;
        case 'KeyV':
          if (modKeyPressed) {
            console.log('Paste not implemented'); // eslint-disable-line
            event.preventDefault();
          }
          break;
        case 'KeyZ':
          if (modKeyPressed) {
            event.preventDefault();
            if (event.shiftKey) {
              d3Interface.redo();
            } else {
              d3Interface.undo();
            }
          }
          break;
        case 'KeyY':
          if (modKeyPressed) {
            d3Interface.redo();
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
          d3Interface.deleteSelectedElements();
          break;
        default:
          return false;
      }
      return true;
    };
    window.addEventListener('keydown', onKeyDown);
  }
}
