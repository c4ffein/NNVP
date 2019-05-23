export default class {
  constructor(d3Interface) {
    const isApple = navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i);
    const inputs = ['input', 'select', 'button', 'textarea'];

    const onKeyDown = (event) => {
      if (document.activeElement && inputs.includes(document.activeElement.tagName.toLowerCase())) {
        return false;
      }

      let modKeyPressed;
      if (isApple) {
        modKeyPressed = event.metaKey;
      } else {
        modKeyPressed = event.ctrlKey;
      }

      switch (event.code) {
        case 'Backspace':
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
    window.addEventListener('keydown', onKeyDown);
  }
}
