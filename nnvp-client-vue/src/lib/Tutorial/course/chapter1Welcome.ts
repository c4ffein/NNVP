// Chapter 1 — Start here. Orientation: what this tool is for (neural networks,
// the machinery under modern AI), how the room is laid out, that nothing can
// break — and the door into the Concepts book.

import type { TutorialDef } from '../tutorials';
import { conceptRead, placedLayers } from '../predicates';

const welcome: TutorialDef = {
  id: 'welcome',
  title: 'Start here',
  description: 'Find your way around the tool — and open the book that explains what you are really building.',
  course: { id: 'browser-poet', order: 1 },
  steps: [
    {
      id: 'open-first-concept',
      concepts: ['what-is-a-neural-network'],
      title: 'What this place is',
      instruction:
        'This editor builds neural networks — the machinery underneath modern '
        + 'AI, all the way up to the chatbots you talk to. Click the 📖 link '
        + 'below to open the book\'s first concept.',
      detail:
        'Almost every lesson step carries a 📖 link like this one into the '
        + 'Concepts book: theory when you want it, one click away — and one '
        + 'click back to the lesson.',
      target: () => null,
      isComplete: () => conceptRead('what-is-a-neural-network'),
    },
    {
      id: 'place-anything',
      title: 'Place any layer',
      instruction:
        'The left panel is the Layer Catalog — every building block lives '
        + 'there. Click any layer to drop it on the canvas.',
      detail:
        'The canvas in the middle is the board where you draw networks; the '
        + 'right panel shows the selected layer\'s options.',
      target: '#layerCatalog',
      isComplete: $d3 => placedLayers($d3).length >= 1,
    },
    {
      id: 'undo-it',
      title: 'Undo it',
      instruction:
        'Now press Ctrl+Z. The board steps back — every action here is '
        + 'undoable, so you can never really break anything.',
      detail:
        'That safety net covers everything: your edits, the tutorials\' '
        + '"Do it for me" buttons, even the assistant\'s changes. Explore '
        + 'fearlessly. (If your board already had layers, undo just your new '
        + 'one and press Next.)',
      target: '#FlowBoard',
      isComplete: $d3 => placedLayers($d3).length === 0,
    },
    {
      id: 'ready',
      concepts: ['tensors-and-shapes'],
      title: 'You know the room',
      instruction:
        'That is the whole cockpit: catalog on the left, board in the middle, '
        + 'options on the right, menus up top — and the book one click away. '
        + 'Next lesson: build your first model.',
      detail:
        'Shapes are the first thing a real model needs — peek at the concept '
        + 'below if you are curious, or jump straight in.',
      target: () => null,
      isComplete: () => true,
    },
  ],
};

export default welcome;
